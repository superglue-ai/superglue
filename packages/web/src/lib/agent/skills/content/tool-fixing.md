# Tool Fixing

Tool fixing applies targeted changes to an existing tool configuration using RFC 6902 JSON Patch operations. The `edit_tool` tool accepts patches directly — you generate the patches, `edit_tool` validates and applies them.

## Patch Format

Each operation:

```typescript
{
  op: "add" | "remove" | "replace" | "move" | "copy" | "test",
  path: string,      // JSON Pointer (e.g., "/steps/0/config/url")
  value?: any,       // required for add, replace, test
  from?: string      // required for move, copy
}
```

### Path Rules

- JSON Pointer notation: starts with `/`, uses `/` as separator
- Array indices are **zero-based**: `/steps/0` = first step, `/steps/1` = second
- Append to array: `/steps/-`
- The `value` field contains the **actual value** — no JSON escaping needed

### Validation Rules

- `op` is required on every patch
- `path` is required on every patch and must start with `/`
- `add`, `replace`, `test` require `value`
- `move`, `copy` require `from`
- Patches are applied **sequentially** — later patches see the effects of earlier patches

## Tool Structure — Key Paths

Patches target paths on the tool config structure (see tool-building skill for full schema).

## Operations

### replace — Change an existing value

**The path must already exist** — if the field is `null` or absent, `replace` fails with `OPERATION_PATH_UNRESOLVABLE`. Use `add` instead for optional fields that may not be set (e.g., `inputSchema`, `outputSchema`, `outputTransform`).

```json
{ "op": "replace", "path": "/steps/0/config/url", "value": "https://api.example.com/v2/users" }
```

### add — Add new field or array element

Creates the field if missing, overwrites if it exists. **Prefer `add` over `replace`** when the field might be null or absent.

```json
{"op": "add", "path": "/steps/0/config/headers/X-Custom", "value": "my-value"}
{"op": "add", "path": "/steps/-", "value": {"id": "newStep", "config": {"systemId": "api", "url": "...", "method": "GET"}}}
```

### remove — Delete field or array element

```json
{"op": "remove", "path": "/steps/2"}
{"op": "remove", "path": "/steps/0/config/pagination"}
```

### move — Reorder or relocate

```json
{ "op": "move", "from": "/steps/2", "path": "/steps/0" }
```

### test — Assert before applying (safety check)

```json
{ "op": "test", "path": "/steps/0/config/method", "value": "GET" }
```

## Result Wrapping — #1 Source of Bugs

**Every step result is wrapped in `{ currentItem, data, success }`.** You must go through `.data` to access the actual response.

- **Object selector (or none)** → `sourceData.stepId = { currentItem, data, success }` → access via `sourceData.stepId.data`
- **Array selector** → `sourceData.stepId = [{ currentItem, data, success }, ...]` → access via `sourceData.stepId.map(i => i.data)`

Check the step's `dataSelector` to determine which shape you have. When writing a data selector for a loop step, return the unwrapped array:

```javascript
(sourceData) => sourceData.getUsers.data.users              // object-selector upstream
(sourceData) => sourceData.getUsers.flatMap(i => i.data.users) // array-selector upstream
```

## Examples

### Fix data selector (object-selector step upstream)

```json
{
  "op": "replace",
  "path": "/steps/1/dataSelector",
  "value": "(sourceData) => sourceData.getUsers.data.filter(u => u.active)"
}
```

Note: `getUsers` used an object selector, so its result is `{ currentItem, data, success }`. We access `.data` to get the API response, then filter.

### Fix output transform

```json
{
  "op": "replace",
  "path": "/outputTransform",
  "value": "(sourceData) => { var users = sourceData.getUsers.data.results; return users.map(function(u) { return { id: u.id, name: u.fullName, email: u.email }; }); }"
}
```

### Add pagination

```json
{
  "op": "add",
  "path": "/steps/0/config/pagination",
  "value": {
    "type": "cursorBased",
    "pageSize": "100",
    "cursorPath": "meta.next_cursor",
    "stopCondition": "!response.data.meta.next_cursor"
  }
}
```

### Remove a step and fix downstream references

```json
[
  { "op": "remove", "path": "/steps/2" },
  {
    "op": "replace",
    "path": "/steps/2/dataSelector",
    "value": "(sourceData) => sourceData.getUsers.data"
  }
]
```

Note: after removing step at index 2, indices shift down. What was step 3 is now at index 2 — that's why we patch `/steps/2`, not `/steps/3`.

## The Confirmation Flow

1. You generate patches and call `edit_tool` with `patches` array + `draftId`/`toolId` + `payload`
2. `edit_tool` validates and applies patches, returns the updated config + diffs
3. User sees a diff UI showing each change
4. User can **confirm all**, **partially approve** (accept some, reject others), or **decline all**
5. If partially approved: only the approved diffs are applied to the original config
6. You receive the confirmation result — if changes were rejected, you can generate new patches

## Validation

After patches are applied, the same validation rules from the tool-building skill apply (valid id, steps array, systemIds match, URLs present, etc.). If validation fails, `edit_tool` returns an error — correct the patches and try again.

## Principles

- **Minimal changes** — only patch what's broken
- **Check result wrapping** — before writing any dataSelector or outputTransform patch, determine whether the upstream step used an object or array selector, and access `.data` accordingly
- **Update instruction** — if the fix changes tool behavior, update `/instruction` too
- **Don't forget downstream** — if you change a step's output shape, check if dataSelectors and outputTransform in later steps need updating
- **Index shifts** — when removing array elements, subsequent indices shift down. Account for this in multi-patch operations.

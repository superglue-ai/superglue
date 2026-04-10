# Tool Editing

Ensure you have loaded the data-handling skill before editing tools. Edit tools using RFC 6902 JSON Patch operations. The `edit_tool` tool accepts patches directly — you generate the patches, `edit_tool` validates and applies them.

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

Patches target paths on the tool config structure (see tool-building skill for full schema). Key top-level paths:

- `/id` — tool ID (kebab-case)
- `/instruction` — tool description
- `/steps/N` — step at index N
- `/steps/N/config/url`, `/steps/N/config/method`, `/steps/N/config/headers`, etc.
- `/steps/N/dataSelector` — JS function controlling input + loop mode
- `/outputTransform` — final output shaping function
- `/outputSchema` — optional JSON schema for output

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

See data-handling skill for the full result envelope reference. The critical rule: **every step result is wrapped in `{ currentItem, data, success }`** — you must go through `.data` to access the actual response. Check the step's `dataSelector` to determine if the result is an object envelope or an array of envelopes.

## Examples

### Fix data selector (object-selector step upstream)

```json
{
  "op": "replace",
  "path": "/steps/1/dataSelector",
  "value": "(sourceData) => sourceData.getUsers.data.filter(u => u.active)"
}
```

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

Note: after removing step at index 2, indices shift down. What was step 3 is now at index 2.

## The Confirmation Flow

1. You generate patches and call `edit_tool` with `patches` array + `draftId`/`toolId` + `payload`
2. `edit_tool` validates and applies patches, returns diffs plus confirmation defaults
3. User sees a diff UI showing each change
4. User can **confirm all**, **partially approve** (accept some, reject others), or **decline all**
5. If partially approved: only the approved diffs are applied to the original config
6. You receive the confirmation result — always inspect `persistence`, `toolId`, `draftId`, and `saveError`

### Persistence Contract

The confirmation result is the source of truth for where the accepted changes now live:

- `persistence: "saved"` means the canonical saved tool was updated
- `persistence: "draft_only"` means the accepted changes only live in a draft

Do not infer persistence from button labels, prior context, or interaction logs when these fields are present.

### Default Save Behavior

Main agent:

- Accepted edits save by default
- Partial approvals are treated the same way as full approvals: approved diffs are saved by default
- If saving fails, the result explicitly falls back to `persistence: "draft_only"` and includes `saveError`
- For follow-up edits or runs, use `toolId` when `persistence` is `"saved"` and `draftId` when it is `"draft_only"`

Tool playground agent:

- The default confirm action is save
- The alternate Accept action keeps changes draft-only
- Partial approvals follow the same rule as full approvals: the chosen confirm action determines whether approved diffs are saved or kept draft-only
- Continue using `draftId: "playground-draft"` for follow-up edits or runs in the playground, even if the accepted changes were also saved

### Partial Approval and Draft Continuity

When the user partially approves, the output contains `approvedDiffs` and `rejectedDiffs` plus the same persistence contract as a full approval.

**Critical**: For follow-up edits in the main agent, continue with `toolId` when `persistence` is `"saved"` and `draftId` when `persistence` is `"draft_only"`. In the tool playground, always continue with `draftId: "playground-draft"`. If the user only clicked the "Test with N changes" button and it failed, no diffs were applied and you MUST re-apply all previous edits that were not applied.

## Validation

After patches are applied, the same validation rules apply (valid id, steps array, URLs present, etc.). If validation fails, `edit_tool` returns an error — correct the patches and try again.

## Debugging with Step Results

By default, `run_tool` only returns the final transformed output (`data`). When the output looks wrong, empty, or has missing fields, re-run with `includeStepResults: true` to see what each step actually returned before the `outputTransform` ran. This helps distinguish between:

- **Step-level failures** — an API returned an error or unexpected structure
- **Transform bugs** — the step data is correct but `outputTransform` or `dataSelector` is accessing the wrong path

## Principles

- **Minimal changes** — only patch what's broken
- **Check result wrapping** — before writing any dataSelector or outputTransform patch, determine whether the upstream step used an object or array selector, and access `.data` accordingly
- **Update instruction** — if the fix changes tool behavior, update `/instruction` too
- **Don't forget downstream** — if you change a step's output shape, check if dataSelectors and outputTransform in later steps need updating
- **Index shifts** — when removing array elements, subsequent indices shift down. Account for this in multi-patch operations.

## Limitations

- **Cannot unarchive tools** — edit_tool cannot restore archived tools. Archived tools must be unarchived manually via the UI before editing.

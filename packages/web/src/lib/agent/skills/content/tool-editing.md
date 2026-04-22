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

- Never patch `id` in edit_tool. Tool IDs and draft IDs are immutable when editing an existing tool.
- `op` is required on every patch
- `path` is required on every patch and must start with `/`
- `add`, `replace`, `test` require `value`
- `move`, `copy` require `from`
- Patches are applied **sequentially** — later patches see the effects of earlier patches

## Tool Structure — Key Paths

Patches target paths on the tool config structure (see tool-building skill for full schema). Key top-level paths:

- `/name` — display name shown in the UI
- `/instruction` — tool description
- `/steps/N` — step at index N
- `/steps/N/config/url`, `/steps/N/config/method`, `/steps/N/config/headers`, etc.
- `/steps/N/dataSelector` — JS function controlling input + loop mode
- `/outputTransform` — final output shaping function
- `/outputSchema` — optional JSON schema for output
- `/inputSchema/properties/__files__` — declared file input aliases in persisted tool schemas

`inputSchema` only describes expected frontend/agent UI inputs. In persisted schemas, normal JSON payload fields stay at the top level and file aliases live under `__files__`, not `files`.

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

## The Confirmation Flow

1. You generate patches and call `edit_tool` with `patches` array + `toolId` (or `draftId` in playground) + `payload`
2. `edit_tool` validates and applies patches, returns diffs plus confirmation defaults
3. User sees a diff UI showing each change
4. User can **confirm all**, **partially approve** (accept some, reject others), or **decline all**
5. If partially approved: only the approved diffs are applied to the original config
6. You receive the confirmation result

### Default Save Behavior

Main agent:

- Accepted edits (full or partial approval) auto-save. Use `toolId` for follow-up operations.

Tool playground agent:

- The default confirm action is save
- The alternate Accept action keeps changes draft-only
- Partial approvals follow the same rule as full approvals: the chosen confirm action determines whether approved diffs are saved or kept draft-only
- Continue using `draftId: "playground-draft"` for follow-up edits or runs in the playground, even if the accepted changes were also saved

## Validation

After patches are applied, the same validation rules apply (valid id, steps array, URLs present, etc.). If validation fails, `edit_tool` returns an error — correct the patches and try again.

## Debugging with Step Results

By default, `run_tool` only returns the final transformed output (`data`). When the output looks wrong, empty, or has missing fields, you can re-run with `includeStepResults: true` to see what each step actually returned before the `outputTransform` ran.

## Principles

- **Check result wrapping** — before writing any dataSelector or outputTransform patch, determine whether the upstream step used an object or array selector, and access `.data` accordingly
- **Don't forget downstream** — if you change a step's output shape, check if dataSelectors and outputTransform in later steps need updating
- **Index shifts** — when removing array elements, subsequent indices shift down. Account for this in multi-patch operations.

## Limitations

- **Cannot unarchive tools** — edit_tool cannot restore archived tools. Archived tools must be unarchived manually via the UI before editing.
- **Cannot edit tool ids** - edit_tool cannot edit a tool's id

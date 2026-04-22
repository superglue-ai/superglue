# Tool Building

## Build Recipe

Before producing a tool config:

1. Load relevant skills: data-handling and protocol skill(s) for the involved systems
2. Use find_system for every involved system — note storedCredentials and URL
3. Use search_documentation for each system — look up endpoints, auth patterns, pagination, response structure
4. Use web_search for the specific API to find information not present in the docs
5. Use call_system to test 1-2 primary endpoints — verify response structure and field names before building
6. Only then call build_tool with the full tool config

## Planning Steps

- Fetch prerequisites: available projects, entity types, categories, etc.
- Each step = one API call, one DB query, one file operation or a transform step (no compound ops)
- Final aggregation/filtering/sorting should happen in the outputTransform, not in a step

### Choosing Between Transform Points

| Need                                              | Use                                        |
| ------------------------------------------------- | ------------------------------------------ |
| Control step input or trigger loop mode           | `dataSelector`                             |
| Intermediate data needed by a later request step  | Transform step                             |
| Aggregating/combining results from multiple steps | Transform step                             |
| Complex body construction for a request           | Transform step + simple `<<>>` ref in body |
| Final output shaping                              | `outputTransform`                          |
| Simple filtering within one step                  | `dataSelector` returning a filtered array  |

**Do NOT** add a transform step right before the outputTransform — merge it into the outputTransform instead. Rule of thumb: if your `<<>>` expression is longer than ~80 characters or contains multiple statements, use a transform step.

- Step instructions: 2-3 sentences describing the goal and expected data
- instruction: Write a 1-2 sentence summary of the tool's purpose — what it does and what it returns. Never leave empty.

## Step Result Envelopes

Every step result is wrapped — you MUST account for this in dataSelectors and outputTransform. See data-handling skill for the full envelope reference.

- **Object selector (or none)** → access via `sourceData.stepId.data`
- **Array selector** → access via `sourceData.stepId.map(i => i.data)`
- **Paginated step** → access via `sourceData.stepId.data` (pages are merged server-side into a single envelope — do NOT `.map()` over it)

NEVER access step results without `.data` — `sourceData.stepId.results` will fail because you're hitting the envelope, not the API response.

## modify Flag

Set `modify: true` only when the step writes, updates, or deletes live data. Don't rely on HTTP method alone — a POST that only reads (e.g., GraphQL query) should be `modify: false`. Default is false.

## Tool Config Structure

build_tool expects the full tool config as input:

```typescript
{
  id: string,                    // kebab-case (e.g., "stripe-list-orders")
  instruction: string,           // 1-2 sentence summary of what the tool does
  steps: [{
    id: string,                  // camelCase (e.g., "fetchUsers")
    instruction?: string,        // what this step does
    dataSelector?: string,       // JS: (sourceData) => object | array
    modify?: boolean,
    config: RequestStepConfig | TransformStepConfig
  }],
  outputTransform: string,       // JS: (sourceData) => finalOutput
  outputSchema?: JSONSchema,     // only if user explicitly requests output shape
  payload?: object               // sample payload for inputSchema generation
}
```

When calling `build_tool`, keep runtime test data separate from the persisted tool config:

- `payload`: sample JSON input data
- `files`: optional file input bindings (`alias -> file::<uploaded_key>`)

If you bind files while building, the persisted `inputSchema` will use nested sections when needed:

```typescript
{
  type: "object",
  properties: {
    payload: { ... },
    __files__: { ... },
    credentials: { ... }
  }
}
```

Important distinction:

- `inputSchema` only defines expected input shape for the frontend and agent UI
- Persisted tool schemas keep normal JSON payload fields at the top level and declare file aliases under `inputSchema.properties.__files__`
- When calling `build_tool` or `run_tool`, pass actual uploaded file bindings in the top-level `files` argument: `{ payload: {...}, files: {...}, credentials: {...} }`

Legacy payload-only schemas still work. Do not invent a top-level `payload` wrapper in persisted `inputSchema`, and do not rewrite `inputSchema.properties.__files__` to `inputSchema.properties.files`.

Request step config (HTTP):

```typescript
{
  type: "request",
  systemId?: string,             // links system credentials → <<systemId_credKey>> variables. Omit for public APIs.
  url: string,                   // endpoint URL. PREFER <<systemId_url>>/endpoint over hardcoded URLs when systemId is set
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  headers?: Record<string, string>,  // include auth headers here for HTTP
  queryParams?: Record<string, string>,
  body?: string,
  pagination?: {
    type: "offsetBased" | "pageBased" | "cursorBased",
    pageSize: string,
    cursorPath: string,          // JSONPath, cursorBased only
    stopCondition: string        // JS: (response, pageInfo) => boolean (true = STOP)
  }
}
```

Request step config (Database / Redis / File server):

```typescript
{
  type: "request",
  systemId?: string,             // links system credentials → <<systemId_credKey>> variables
  url: string,                   // connection string with credential placeholders (e.g., postgres://<<sys_user>>:<<sys_pass>>@host/db)
  body: string                   // JSON: { query, params } for databases, { command, args } for Redis, { operation, path } for file servers
}
```

`method`, `headers`, `queryParams`, and `pagination` are HTTP-only fields — omit them for database, Redis, and file server steps.

Transform step config:

```typescript
{
  type: "transform",
  transformCode: string          // JS: (sourceData) => transformedData
}
```

## Validation Rules

If build_tool tool validation fails, you get an error — fix and call build_tool again:

- Tool must have a valid `id` string
- Tool must have a `steps` array
- `systemId` is optional on request steps. Setting it makes that system's credentials available as `<<systemId_credKey>>` template variables in headers/URL/body, and enables `<<systemId_url>>` for the base URL. Omit it for public APIs that need no credentials.
- Every request step must have a non-empty `url`
- Transform steps must have `transformCode`

## Build Result Persistence

Main agent behavior:

- Successful builds auto-save. Use the returned `toolId` for all follow-up operations (run_tool, edit_tool).
- If the requested tool ID already exists, `build_tool` fails with a descriptive error. Use a different ID or edit the existing tool.
- If auto-save fails for another reason, `build_tool` returns `success: false` with an error. Address the underlying issue and retry.

Tool playground behavior:

- Builds remain draft-only until explicitly saved
- Use `save_tool` to persist when ready

## System-Specific Instructions

Systems may include specificInstructions from the user (visible in find_system output). Follow them when present.

## Key Pitfalls

- NEVER guess API endpoints — always verify with documentation or call_system first
- NEVER put `systemId` on the step object — it belongs inside `step.config.systemId`. That's what triggers credential and URL variable resolution.
- NEVER use <<(sourceData) => sourceData.payload.X>> — payload fields are at root level of sourceData
- NEVER use <<currentItem.id>> - use arrow function syntax for nested properties, e.g. <<(sourceData) => sourceData.currentItem.id>>
- NEVER hardcode pagination params — use <<page>>, <<offset>>, <<cursor>>, <<limit>>
- NEVER add an outputSchema unless the user explicitly requested a specific response structure. If you do add one, update the outputTransform to map step data to match it.
- NEVER use build_tool to modify an existing tool — use edit_tool with JSON Patch operations instead
- NEVER leave instructions empty — always summarize what the tool does
- ALWAYS explicitly configure authentication in every step — credentials are never automatically included in any protocol. You must place them yourself:
  - **HTTP/HTTPS**: Include auth headers using `<<systemId_credentialKey>>` syntax (e.g., `"Authorization": "Bearer <<gmail_access_token>>"`). OAuth systems also require an explicit header — only the token refresh is automatic.
  - **PostgreSQL/MSSQL**: Embed credential placeholders in the connection URL (e.g., `postgres://<<sys_user>>:<<sys_pass>>@host/db`).
  - **Redis**: Embed credential placeholders in the connection URL (e.g., `redis://<<sys_user>>:<<sys_pass>>@host/db`).
  - **SFTP/FTP/SMB**: Embed credential placeholders in the connection URL (e.g., `sftp://<<sys_user>>:<<sys_pass>>@host/path`).
- The `<<systemId_credentialKey>>` syntax is a template variable resolved at runtime — placing it in the config is what makes auth work. Nothing is injected behind the scenes.
- PREFER system URL variables (`<<systemId_url>>`) over hardcoded base URLs — this enables the same tool to work across dev/prod environments without modification. Only hardcode URLs when they differ significantly from the system's base URL.
- Check find_system output for `storedCredentials` to know the exact variable names available
- If there are payload input credentials, ALWAYS prioritize them over system-stored credentials
- Always check documentation for the correct authentication pattern before building
- outputTransform must be a single-line JS string (DO NOT ADD literal newlines or tabs in the code string)
- NEVER use regex literals with `/` or complex escapes in transforms — they corrupt during serialization. Use `new URL()`, `.split()`, or `new RegExp()` instead. See data-handling skill "Serialization Safety".
- For complex request bodies, always use a preceding transform step — don't put multi-statement logic inside <<>> expressions
- When the body contains nested/stringified JSON (e.g. LLM APIs, structured outputs): always have the `<<>>` expression return a string via `JSON.stringify(...)`, and use a single expression for the whole body rather than mixing `<<>>` expressions with static JSON. Returning a plain object risks double-encoding because the runtime stringifies at multiple stages.

## Complex Body Construction

When a request body needs data from multiple previous steps or requires aggregation, use a preceding transform step:

**BAD** — complex logic inside `<<>>`:

```javascript
body: "<<(sourceData) => { const items = sourceData.step1.data.map(...); const filtered = items.filter(...); return JSON.stringify({ data: filtered, count: filtered.length }); }>>";
```

**GOOD** — transform step prepares data, request step stringifies it:

```javascript
// Step: prepareBody (transform)
transformCode: "(sourceData) => { var items = sourceData.step1.data.results; return { data: items.filter(function(i) { return i.active; }), count: items.length }; }";

// Step: submitData (request)
body: "<<(sourceData) => JSON.stringify(sourceData.prepareBody.data)>>";
```

This pattern also applies to LLM / JSON API bodies with embedded dynamic data. Build the body object in a transform step, then reference it with `<<(sourceData) => JSON.stringify(sourceData.prepStep.data)>>`. This avoids double-encoding from the runtime's own stringify passes and avoids partial resolution from mixing multiple `<<>>` expressions in one body string.

## File References in Steps

See the file-handling skill for the complete reference on file detection, parsing, aliasing rules, and the `RuntimeExecutionFile` shape.

Key rules for tool building:

- In step configs, always use `.raw`, `.base64`, or `.extracted` suffixes: `"content": "file::my_csv.raw"` or `"data": "file::my_csv.extracted"`
- Bare `file::<key>` is NOT valid in step configs — it will cause a runtime error
- For SFTP/FTP/SMB put operations, use `.raw` to preserve exact file bytes: `"content": "file::report.raw"`
- For HTTP POST with raw file body, use `.raw`: `"body": "file::document.raw"`
- For HTTP or XML/JSON APIs that expect base64 text, use `.base64`: `"body": "{\"fileBase64\":\"file::document.base64\"}"`
- For HTTP multipart uploads, set `headers: { "Content-Type": "multipart/form-data" }` and make `body` a JSON object string. The runtime will build `FormData` automatically. Example: `"body": "{\"file\":\"file::document.raw\",\"note\":\"monthly export\"}"`
- When referencing files from a previous step's output, use the step ID: `"content": "file::downloadStep.raw"`
- For multi-file steps, use bracket notation: `"content": "file::downloadStep[\"report.csv\"].raw"`
- File references are resolved only in body/content fields, not in headers or query parameters
- When reading produced files inside transform code or `outputTransform`, use `sourceData.__files__` with the runtime alias (see file-handling skill for aliasing rules)
- In transform code, avoid hardcoding quoted bracket aliases like `sourceData.__files__["step[\"file.csv\"]"]` when possible. Prefer `stepFileKeys` or `Object.keys(sourceData.__files__)` to discover aliases dynamically.

## Transform-Produced Files

Transform steps can produce files by returning a reserved `__files__` key. See the file-handling skill for the full shape, aliasing rules, and access patterns.

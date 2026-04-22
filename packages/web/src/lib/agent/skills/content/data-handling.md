# Data Handling

## Variable Replacement (`<<>>` Syntax)

The `<<expression>>` syntax injects dynamic values into step config fields (url, headers, body, queryParams).

### Available top-level variable keys

```
<<userId>>           payload tool inputs
<<currentItem>>      whole current loop item
<<page>>             pagination vars
<<systemId_api_key>> system credentials
<<systemId_url>>     system base URLs
<<sg_auth_email>>    email of the authenticated user
```

**CRITICAL**: Simple `<<varName>>` references only work for top-level keys in the merged variable object. The examples above are common keys, not an exhaustive list. NO dots, NO nesting.

- VALID: `<<userId>>`, `<<currentItem>>`, `<<page>>`, `<<stripe_api_key>>`, `<<stripe_url>>`, `<<sg_auth_email>>`
- INVALID: `<<currentItem.id>>`, `<<sourceData.userId>>`, `<<user.name>>` — these FAIL at runtime

### Arrow Function Expressions (for everything else)

```
<<(sourceData) => sourceData.currentItem.player_id>>
<<(sourceData) => sourceData.getUsers.data.map(u => u.id)>>
<<(sourceData) => JSON.stringify({ ids: sourceData.fetchUsers.data.map(u => u.id) })>>
```

### Resolution Order

1. Direct lookup: check if expression is a top-level key in the merged variable object
2. Arrow function: execute in Deno subprocess sandbox with full data as `sourceData`
3. Failure: throws error listing available keys

### Variable Sources

Variables come from a single merged object:

```javascript
{
  ...originalPayload,       // user-provided input
  ...previousStepResults,   // keyed by stepId
  ...systemCredentials,     // namespaced: systemId_credKey
  ...systemUrls,            // namespaced: systemId_url
  sg_auth_email,            // email of authenticated user (context variable)
  currentItem,              // current loop item (if in a loop)
  page, offset, cursor,     // pagination variables
  limit, pageSize           // pagination size
}
```

## Context Variables

Context variables provide information about the execution environment:

- `<<sg_auth_email>>` — Email address of the authenticated user who triggered the tool execution

### Return Type Handling

- Objects/arrays returned from expressions → JSON.stringified automatically
- Resolved values of `"undefined"` or `"null"` → stripped from headers and queryParams

### Special: Basic Auth

`"Authorization": "Basic <<user>>:<<pass>>"` is auto-converted to Base64. Do NOT manually encode.

## Credential Resolution

Credentials are available via `<<>>` syntax. Two sources, payload takes precedence:

1. **System credentials**: Stored on System, namespaced as `<<systemId_credKey>>`

   ```javascript
   // System id="stripe", credentials={ api_key: "sk_..." }
   // Available as: <<stripe_api_key>>
   ```

2. **Payload credentials**: Passed at runtime, accessed directly
   ```javascript
   // Payload: { user_access_token: "abc" }
   // Available as: <<user_access_token>>
   ```

For OAuth systems, use `<<systemId_access_token>>` — the token value is auto-refreshed during tool execution, but the header itself must be present in the step config.

## System URL Resolution

System URLs are available via `<<systemId_url>>` syntax. This enables environment-agnostic tools:

```javascript
// System id="salesforce", url="https://mycompany.salesforce.com"
// Available as: <<salesforce_url>>

// Step config:
{
  "url": "<<salesforce_url>>/services/data/v58.0/sobjects/Account",
  "headers": { "Authorization": "Bearer <<salesforce_access_token>>" }
}
```

**Why use system URL variables?**

- Same tool works across dev/prod environments without modification
- When switching execution mode, the system URL resolves to the appropriate environment

## Data Selectors

Every step has a `dataSelector` — a JS function that controls execution mode and what `currentItem` is.

### Returns OBJECT → Single Execution

Step runs once. The object becomes `currentItem`.

```javascript
(sourceData) => ({ userId: sourceData.userId })
(sourceData) => ({})   // run once with no specific input
```

Result stored as:

```javascript
sourceData.stepId = { currentItem: <object>, data: <response>, success: true }
```

### Returns ARRAY → Loop Execution

Step runs once per array element. Each element becomes `currentItem`.

```javascript
(sourceData) => sourceData.getContacts.data.filter(c => c.active)
(sourceData) => sourceData.userIds   // if userIds is an array from payload
```

Result stored as:

```javascript
sourceData.stepId = [
  { currentItem: <item1>, data: <response1>, success: true },
  { currentItem: <item2>, data: <response2>, success: true },
  ...
]
```

Empty arrays are valid — step just skips execution.

### Accessing currentItem in Step Config

```
<<currentItem>>                                           // whole value
<<(sourceData) => sourceData.currentItem.id>>             // property
<<(sourceData) => sourceData.currentItem.name.toUpperCase()>>  // with transform
```

## Result Envelope

**Every** step result (request or transform) is wrapped identically:

### From Object Selector

```javascript
sourceData.stepId = {
  currentItem: <selectorOutput>,
  data: <apiResponse or transformResult>,
  success: true
}

// Access:
sourceData.stepId.data           // the response
sourceData.stepId.currentItem    // what was passed in
```

### From Array Selector

```javascript
sourceData.stepId = [
  { currentItem: <item1>, data: <response1>, success: true },
  { currentItem: <item2>, data: <response2>, success: false, error: "..." },
  ...
]

// Access:
sourceData.stepId.map(item => item.data)                     // all responses
sourceData.stepId.flatMap(item => item.data.results)          // nested arrays
```

### From Paginated Step

Paginated steps merge all pages server-side into a **single** result. The result is always a single envelope, NOT an array — even though multiple pages were fetched.

```javascript
sourceData.stepId = {
  data: <merged response from all pages>,
  success: true
}

// Access:
sourceData.stepId.data              // the merged response
sourceData.stepId.data.items        // if the API wraps results in .items

// WRONG — do NOT treat paginated results as an array of envelopes:
sourceData.stepId.map(...)          // FAILS — stepId is an object, not an array
```

## sourceData Structure

`sourceData` is the cumulative state available to data selectors, variable expressions, and transforms:

```javascript
sourceData = {
  // Original payload fields at ROOT level (NOT under .payload)
  userId: "abc",
  date: "2024-01-15",
  companies: ["acme", "globex"],

  // Previous step results, keyed by step ID
  getUsers: { currentItem: {}, data: { users: [...] }, success: true },
  fetchDetails: [
    { currentItem: { id: 1 }, data: { name: "Alice" }, success: true },
    { currentItem: { id: 2 }, data: { name: "Bob" }, success: true },
  ],

  // Current item (only within a loop step's config)
  currentItem: { id: 1 },

  // Runtime file map — see file-handling skill for full reference
  __files__: { ... }
}
```

Treat `sourceData.__files__` as read-only. See the file-handling skill for file detection, the `RuntimeExecutionFile` shape, aliasing rules, and how to access files in transforms.

## Three Transformation Points

| Point                            | When it runs             | Purpose                              |
| -------------------------------- | ------------------------ | ------------------------------------ |
| `dataSelector`                   | Before step executes     | Controls input + single vs loop mode |
| Transform step (`transformCode`) | As the step itself       | Reshape data between request steps   |
| `outputTransform`                | After all steps complete | Shape final tool output              |

## Transform Steps

Transform steps use `type: "transform"` with a `transformCode` function. They do NOT have: systemId, url, method, headers, body, queryParams, or pagination.

Results are wrapped in the **same envelope** as request steps:

```javascript
sourceData.formatForInsert = { currentItem: <dataSelector output>, data: <transformCode result>, success: true }
```

If the step has a dataSelector returning an array, the transform runs once per item. See tool-building guidelines for when to use transform steps vs dataSelectors vs outputTransform.

### Returning Files From a Transform

Transform steps can produce files by returning a reserved `__files__` key in the result. See the file-handling skill for the full shape, aliasing rules, and access patterns.

## Output Transform

Final transformation shaping the tool's output. Runs after all steps complete. Can access cumulative step result data and payloads.

### Requirements

- Function signature: `(sourceData) => { ... }`
- **Must have a return statement**
- NEVER include newlines or tabs in the code string

## JS Code Constraints (all transform points)

Runs in a Deno subprocess sandbox:

- 8192 MB memory limit, 10 min timeout (transforms/selectors), 3s timeout (pagination stops)
- Async/await IS supported in transforms
- No filesystem access — `--deny-read`, `--deny-write`
- No subprocess spawning — `--deny-run`
- Network access IS available (`--allow-net`) — transforms can make HTTP requests
- JSON-serializable I/O only
- Must return a value (undefined returns null)

### Serialization Safety

All JS code is stored as a JSON string, then MessagePack-serialized to the Deno subprocess, then `eval()`'d. Patterns that break across this pipeline:

- **Regex literals with `/`** — `/https?:\/\/([^/]+)/` corrupts. Use `new URL(str).hostname` or `str.split("//")[1].split("/")[0]` instead.
- **Backslash-heavy patterns** — `\n`, `\t`, `\\` in regex/strings get misinterpreted. Prefer string methods (`.split()`, `.indexOf()`, `.includes()`) over regex.
- **Literal newlines** — code string must be single-line. Use `;` between statements.

**Rule of thumb**: prefer string methods over regex. When regex is unavoidable, use `new RegExp("pattern")` constructor over `/pattern/` literals.

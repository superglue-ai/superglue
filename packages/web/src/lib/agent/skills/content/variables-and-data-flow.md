# Variables, Data Selectors & Data Flow

This is the most important reference for building and fixing tools. Most tool failures trace back to incorrect variable syntax, wrong data selector return types, or misunderstanding the result envelope.

## Variable Replacement (`<<>>` Syntax)

The `<<expression>>` syntax injects dynamic values into step config fields (URL, headers, body, queryParams).

### Simple Variables (top-level keys only)

```
<<userId>>           payload keys
<<currentItem>>      whole current loop item
<<page>>             pagination variable
<<systemId_api_key>> system credential
```

**CRITICAL**: Simple `<<varName>>` only works for top-level keys. NO dots, NO nesting.

- VALID: `<<userId>>`, `<<currentItem>>`, `<<page>>`, `<<stripe_api_key>>`
- INVALID: `<<currentItem.id>>`, `<<sourceData.userId>>`, `<<user.name>>` — these FAIL at runtime

### Arrow Function Expressions (for everything else)

```
<<(sourceData) => sourceData.currentItem.player_id>>
<<(sourceData) => sourceData.getUsers.data.map(u => u.id)>>
<<(sourceData) => sourceData.type === 'premium' ? 'pro' : 'basic'>>
<<(sourceData) => JSON.stringify({ ids: sourceData.fetchUsers.data.map(u => u.id) })>>
<<(sourceData) => new Date().toISOString()>>
```

### Resolution Order

1. Direct lookup: check if expression is a top-level key in the merged variable object
2. Arrow function: execute in isolated-vm sandbox with full data as `sourceData`
3. Failure: throws error listing available keys

### Variable Sources

All variables come from a single merged object:

```javascript
{
  ...originalPayload,       // user-provided input
  ...previousStepResults,   // keyed by stepId
  ...systemCredentials,     // namespaced: systemId_credKey
  currentItem,              // current loop item (if in a loop)
  page, offset, cursor,     // pagination variables
  limit, pageSize           // pagination size
}
```

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
   // Or: <<(sourceData) => sourceData.user_access_token>>
   ```

For OAuth systems, use `<<systemId_access_token>>` — the token value is auto-refreshed, but the header itself must be present in the step config.

## Data Selectors

Every step can have a `dataSelector` — a JS function that controls execution mode and what `currentItem` is.

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
sourceData.stepId.filter(item => item.success).map(i => i.data) // only successes
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
}
```

**NEVER** use `sourceData.payload.X` — payload is merged at root level.

**Rule of thumb**: if your `<<>>` expression is longer than ~80 characters or contains multiple statements, use a transform step instead (see tool-building skill).

Pagination variables (`<<page>>`, `<<offset>>`, `<<cursor>>`, `<<limit>>`, `<<pageSize>>`) are automatically injected during paginated HTTP requests. See http-apis skill for details.

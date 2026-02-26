# Tool Building

## Build Recipe

MANDATORY before producing a tool config:

1. Load relevant skills: superglue-concepts, variables-and-data-flow, transforms-and-output, plus protocol skill(s) for the involved systems
2. Use find_system for every involved system — note credentialPlaceholders and URL
3. Use search_documentation for each system — look up endpoints, auth patterns, pagination, response structure
4. Use web_search for the specific API to find information not present in the docs
5. Use call_system to test 1-2 primary endpoints — verify response structure and field names before building
6. Only then call build_tool with the full tool config

## Planning Steps

- Plan ALL data retrieval steps FIRST — understand what data you need and in what order
- Fetch prerequisites: available projects, entity types, categories, etc. Don't assume you know the data — always fetch first.
- Each step = one API call, one DB query, one file operation or a transform step (no compound ops)
- Use transform steps for intermediate reshaping between request steps
- Prioritize transform steps over complex transformations in request bodies
- Do not add a transform step before the output transform
- Final aggregation/filtering/sorting should happen in the outputTransform, not in a step
- Step IDs: camelCase, descriptive (e.g., fetchCustomerDetails, listInvoices)
- Step instructions: 2-3 sentences describing the goal and expected data
- instruction: Write a 1-2 sentence summary of the tool's purpose — what it does and what it returns. Never leave empty.

## Step Result Envelopes

Every step result is wrapped — you MUST account for this in dataSelectors and outputTransform.

- **Object selector (or none)** → `sourceData.stepId = { currentItem, data, success }` → access via `.data`
- **Array selector** → `sourceData.stepId = [{ currentItem, data, success }, ...]` → access via `.map(i => i.data)`

```javascript
// Object-selector step
dataSelector: "(sourceData) => sourceData.getUsers.data.users";
outputTransform: "(sourceData) => sourceData.getUsers.data.results";

// Array-selector step
dataSelector: "(sourceData) => sourceData.fetchDetails.flatMap(item => item.data.contacts)";
outputTransform: "(sourceData) => sourceData.fetchDetails.map(item => item.data)";
```

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
  payload?: object,              // sample payload for inputSchema generation
  systemIds?: string[]           // system IDs used (for validation)
}
```

Request step config:

```typescript
{
  type: "request",
  systemId: string,
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  headers?: Record<string, string>,
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
- Every request step must have a `systemId` matching one of the provided systemIds
- Every request step must have a non-empty `url`
- Transform steps must have `transformCode`

## System-Specific Instructions

Systems may include specificInstructions from the user (visible in find_system output). Follow them when present.

## Key Pitfalls

- NEVER access step results without `.data` — `sourceData.stepId.results` is WRONG, use `sourceData.stepId.data.results` (object selector) or `sourceData.stepId.map(i => i.data.results)` (array selector)
- NEVER guess API endpoints — always verify with documentation or call_system first
- NEVER use <<(sourceData) => sourceData.payload.X>> — payload fields are at root level of sourceData
- NEVER use <<currentItem.id>> - use arrow function syntax for nested properties, e.g. <<(sourceData) => sourceData.currentItem.id>>
- NEVER hardcode pagination params — use <<page>>, <<offset>>, <<cursor>>, <<limit>>
- NEVER add an outputSchema unless the user explicitly requested a specific response structure. If you do add one, update the outputTransform to map step data to match it.
- NEVER use build_tool to modify an existing tool — use edit_tool with JSON Patch operations instead
- NEVER leave instructions empty — always summarize what the tool does
- ALWAYS include explicit auth headers — credentials are NEVER auto-injected into requests. Every request step must include the appropriate auth header using `<<systemId_credentialKey>>` syntax (e.g., `"Authorization": "Bearer <<gmail_access_token>>"`). OAuth systems also require an explicit header — only the token refresh is automatic.
- Check find_system output for `credentialPlaceholders` to know the exact variable names available
- If there are payload input credentials, ALWAYS prioritize them over system-stored credentials
- Always check documentation for the correct authentication pattern before building
- outputTransform must be a single-line JS string (DO NOT ADD literal newlines or tabs in the code string)
- For complex request bodies, always use a preceding transform step — don't put multi-statement logic inside <<>> expressions

## Complex Body Construction

When a request body needs data from multiple previous steps or requires aggregation, use a preceding transform step:

**BAD** — complex logic inside `<<>>`:

```javascript
body: "<<(sourceData) => { const items = sourceData.step1.data.map(...); const filtered = items.filter(...); return JSON.stringify({ data: filtered, count: filtered.length }); }>>";
```

**GOOD** — transform step prepares data, body references it:

```javascript
// Step: prepareBody (transform)
transformCode: "(sourceData) => { var items = sourceData.step1.data.results; return { data: items.filter(function(i) { return i.active; }), count: items.length }; }";

// Step: submitData (request)
body: "<<(sourceData) => JSON.stringify(sourceData.prepareBody.data)>>";
```

Rule of thumb: if your `<<>>` expression is longer than ~80 characters or contains multiple statements, use a transform step.

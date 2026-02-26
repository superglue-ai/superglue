# HTTP API Steps

Covers REST APIs, GraphQL, webhooks, and any HTTP-based service.

## Step Configuration

```typescript
{
  type: "request",
  systemId: "my_api",
  url: "https://api.example.com/v1/users",   // supports <<variables>> and JS expressions
  method: "GET",                               // GET, POST, PUT, DELETE, PATCH
  headers: { "Authorization": "Bearer <<my_api_access_token>>" }, // // supports <<variables>> and JS expressions
  queryParams: { "limit": "<<limit>>", "status": "active" }, // // supports <<variables>> and JS expressions
  body: '{"name": "<<(sourceData) => sourceData.currentItem.name>>"}', // supports <<variables>> and JS expressions
  pagination: { ... }  // optional
}
```

## Authentication Patterns

```javascript
// Bearer token
{ "Authorization": "Bearer <<systemId_access_token>>" }

// API key in header
{ "X-API-Key": "<<systemId_api_key>>" }

// Basic Auth — auto-encoded to Base64, do NOT manually encode
{ "Authorization": "Basic <<systemId_username>>:<<systemId_password>>" }

// Runtime credentials from payload
{ "Authorization": "Bearer <<(sourceData) => sourceData.user_access_token>>" }
```

Headers starting with `x-` are treated as custom headers.
Modern APIs expect auth in headers, NOT query parameters, unless docs explicitly say otherwise.

## Request Behavior

- **GET, HEAD, DELETE, OPTIONS**: Body is always stripped
- **POST, PUT, PATCH**: Body with leading `{` is JSON-parsed; empty body becomes undefined
- Default headers: `Accept: */*`, Chrome-like `User-Agent`
- HTTPS: `rejectUnauthorized: false` (accepts self-signed certs)
- Responses: always read as arraybuffer, then auto-parsed (JSON, CSV, XML, etc.)

## Error Detection

### HTTP Status Errors

Non-2xx responses throw with: method, URL, response body preview (1000 chars), masked config, retry count.

### Smart Error Detection in 2xx Responses

Even successful responses are scanned for error indicators:

- `response.code` or `response.status` is 400-599 → throws
- Keys matching `error`, `errors`, `error_message`, `failure_reason`, `failure`, `failed` (up to depth 2) with non-empty values → throws
- Error message includes: _"To prevent this from happening, enable 'Continue on failure' in the step's Advanced Settings."_

Bypass: `failureBehavior: "continue"` skips all error checking. Can be set in the tool playground.

## Retry Logic

### Connection/Server Errors

- Default 1 retry (3 if keep-alive disabled), capped at server max
- Only retries if response was fast (under quick-retry threshold)
- Configurable delay between retries

### Rate Limiting (429)

- Respects `Retry-After` header (seconds or date)
- Without header: exponential backoff `10^n * 1000ms + jitter` (max 1hr per wait)
- Total wait capped at `MAX_RATE_LIMIT_WAIT_MS`
- Separate from general retry count

## Pagination

Makes multiple requests in a loop, merging results. Only configure if you've verified the exact pagination mechanism from docs.

### Configuration

```typescript
pagination: {
  type: "offsetBased" | "pageBased" | "cursorBased",
  pageSize: "50",
  cursorPath: "meta.next_cursor",   // cursorBased only — JSONPath to cursor
  stopCondition: "(response, pageInfo) => !response.data.meta.next_cursor"
}
```

### Variables (auto-injected)

| Type        | Variable                     | Starts at | Increments by            |
| ----------- | ---------------------------- | --------- | ------------------------ |
| pageBased   | `<<page>>`                   | 1         | 1                        |
| offsetBased | `<<offset>>`                 | 0         | pageSize                 |
| cursorBased | `<<cursor>>`                 | null      | extracted via cursorPath |
| all         | `<<limit>>` / `<<pageSize>>` | pageSize  | —                        |

**CRITICAL**: The matching pagination variable MUST appear in the request (URL, queryParams, headers, or body). Throws if missing.

### Stop Conditions

JS expression evaluated in sandbox. Receives `(response, pageInfo)`:

- `response.data` = parsed API response body
- `response.headers` = response headers
- `pageInfo = { page, offset, cursor, totalFetched }`
- Return `true` to **STOP**

Examples:

```javascript
"!response.data.meta.next_cursor"; // no next cursor
"response.data.items.length === 0"; // empty page
"response.data.hasMore === false"; // explicit flag
"pageInfo.totalFetched >= 1000"; // item cap
```

### Safety Checks (only when stopCondition is set)

1. **Identical pages 1 & 2** (both with data): Throws — pagination params aren't being applied
2. **Both pages empty + stop didn't trigger**: Throws — broken stop condition
3. **Duplicate consecutive response (after page 2)**: Auto-stops

### Without stopCondition (fallback)

- Array shorter than pageSize → stop
- Duplicate response hash (against any previously seen page) → stop
- Non-array response → stop after first request
- Max 500 requests (vs 1000 max with a stopCondition)

### Cursor Extraction

`cursorPath` is a JSONPath expression (auto-prefixed with `$.` if needed). Extracted via `jsonpath-plus`. Null cursor → stop.

## Output

Returns single object if one result, array if multiple (unwrapped from single-element array).

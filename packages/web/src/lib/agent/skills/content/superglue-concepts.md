# superglue Core Concepts

superglue is an integration platform that builds and runs deterministic multi-step workflows ("tools") connecting APIs, databases, and file servers. AI generates tool configurations during building — execution is 100% deterministic JavaScript.

## Tools

A tool is a saved, reusable workflow with an `id`, ordered `steps`, optional `outputTransform`/`outputSchema`, and optional `inputSchema` for payload validation. See the tool-building skill for the full config schema.

## Systems

Reusable building blocks containing connection info + credentials for external services. Each system has an `id`, `url` (base URL with protocol), `credentials`, optional `specificInstructions`, and optional `documentationFiles`.

## Steps

Each step is one atomic operation — a single API call, database query, file operation, or JavaScript transformation. Steps have a camelCase `id` (becomes the key in sourceData), an optional `dataSelector` controlling loop behavior, a `config` (either request or transform), and optional `failureBehavior` ("fail" | "continue").

Request steps have: `systemId`, `url`, `method`, `headers`, `queryParams`, `body`, optional `pagination`.
Transform steps have: `type: "transform"` (required discriminator) and `transformCode`.

See the tool-building skill for full config schemas.

## Execution Pipeline

`ToolExecutor.execute({ payload, credentials, options })`:

1. **Validate** tool structure (id, steps array, URLs on request steps)
2. **For each step in order:**
   a. Build aggregated data: `{ ...originalPayload, ...previousStepResults }`
   b. Resolve system credentials (refresh OAuth if needed), namespace as `systemId_key`
   c. Run `dataSelector` → object means single execution, array means loop
   d. For each item: merge `currentItem` into input and execute
   e. Wrap result: `{ currentItem, data, success }`
   f. On failure: abort if `failureBehavior !== "continue"`
3. **Output transform** (if present): run JS function, validate against outputSchema
4. **Response filters** (if present): remove/mask/fail on pattern matches

## Strategy Routing

Steps are routed to execution strategies by protocol (first match wins):

1. Transform steps → if `config.type === "transform"`
2. HTTP → URL starts with `http`
3. PostgreSQL → URL starts with `postgres://` or `postgresql://`
4. FTP/SFTP → URL starts with `ftp://`, `ftps://`, or `sftp://`
5. SMB → URL starts with `smb://`

All user-provided JS (data selectors, transforms, stop conditions) runs in an isolated sandbox. See transforms-and-output skill for constraints.

## File Handling

superglue auto-parses files from any source:

- CSV → array of objects (auto-detects delimiters/headers)
- Excel → `{sheetName: [rows]}`
- JSON → parsed (resilient parser with repair)
- PDF → `{textContent, structuredContent}`
- XML → nested objects via SAX
- ZIP → extracts + parses each file
- DOCX → raw text

User files are injected via `file::<key>` syntax in payloads.

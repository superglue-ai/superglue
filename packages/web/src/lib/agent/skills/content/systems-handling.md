# Systems Handling

Systems are reusable building blocks containing connection info and credentials for external services. This skill covers creating, editing, finding, and authenticating systems.

## System Lifecycle

1. **Find** — `find_system` to check if the system already exists, get template info
2. **Create** — `create_system` to register a new system (or use `templateId` for known services)
3. **Authenticate** — `authenticate_oauth` if the system uses OAuth
4. **Explore** — `call_system` to test endpoints, verify auth, examine response shapes
5. **Edit** — `edit_system` to update credentials, add documentation, or usage instructions

## Credential Model

Two fields in system creation and editing tools, split by sensitivity:

### `credentials` — Non-sensitive config (stored directly)

```
client_id, auth_url, token_url, scopes, grant_type, redirect_uri
```

### `sensitiveCredentials` — Secrets requiring user input

```json
{ "api_key": true, "client_secret": true }
```

Setting a field to `true` triggers a **secure UI** where the user enters the actual value. The agent never sees the real secret — only masked placeholders like `<<masked_api_key>>`.

**NEVER ask users to paste secrets in chat.** Always use `sensitiveCredentials` instead.

### Credential Use in Tools

For every systemId referenced in a tool, credentials are namespaced as `<<systemId_credentialKey>>` and can be referenced in configs. They are NOT injected / set automatically but must explicitly be referenced in headers.

```
System id="stripe", credentials={ api_key: "sk_..." }
→ Available as: <<stripe_api_key>>
```

OAuth tokens (`access_token`, `refresh_token`) are auto-refreshed before each step execution. Access tokens must also be explicitly referenced in step headers to authenticate requests.

## Templates

Templates auto-populate system endpoints, documentation URLs, and (for some) OAuth configuration. User-provided values always override template values.

### Preconfigured OAuth Templates

These have superglue-managed OAuth credentials — no user-provided `client_id` or `client_secret` needed:

- slack, salesforce, asana, notion, airtable, jira, confluence

The `client_id` is visible in the template config. The `client_secret` is stored securely server-side and resolved during the OAuth token exchange — it is never exposed to the agent or chat.

### Other Templates

Many services have templates that populate the API URL and docs URL but require user-provided credentials. Use `find_system` to discover available templates.

### Template Matching

When looking up which template applies to a system, resolution order is:

1. `templateName` stored on the system (set during creation)
2. `system.id` direct key lookup
3. `system.id` with numeric suffix stripped (e.g., `firebase_1` → `firebase`)
4. `system.name`
5. `system.url` regex match (most specific regex wins)

### Using Templates

```
create_system({ id: "slack", templateId: "slack" })
```

`templateId` auto-populates: URL, name, OAuth settings, documentation references. Some templates also include `systemSpecificInstructions` (e.g., Jira has instructions about cloud ID requirements and deprecated endpoints). Read and follow them when building tools / creating systems.

## OAuth Setup Flow

### For Preconfigured Templates (slack, salesforce, etc.)

1. `create_system` with `templateId` — credentials auto-populated
2. `authenticate_oauth` with `systemId` and `scopes`
3. User completes OAuth in browser popup
4. Tokens auto-saved to system

### For Custom OAuth

1. `create_system` with `credentials: { client_id: "..." }` and `sensitiveCredentials: { client_secret: true }`
2. User enters `client_secret` in secure UI
3. `authenticate_oauth` with `systemId`, `scopes`, and optionally `auth_url`, `token_url`
4. User completes OAuth flow

### OAuth Credential Resolution

`authenticate_oauth` resolves credentials in order:

1. System credentials (`system.credentials.client_id` / `client_secret`)
2. Template defaults (only for preconfigured templates above)

If missing, use `edit_system` to store them first.

### OAuth Configuration Options

| Parameter          | Default              | Notes                                                  |
| ------------------ | -------------------- | ------------------------------------------------------ |
| `grant_type`       | `authorization_code` | Use `client_credentials` for server-to-server          |
| `tokenAuthMethod`  | `body`               | `basic_auth` sends credentials in Authorization header |
| `tokenContentType` | `form`               | `json` for APIs expecting JSON token requests          |
| `usePKCE`          | false                | Required by Airtable, Twitter, some others             |
| `extraHeaders`     | —                    | e.g., `{"Notion-Version": "2022-06-28"}`               |

### Scopes

Always request **maximum scopes** by default. Only limit if user explicitly requests it.
For Jira/Confluence: always include `offline_access` scope.

## Private / Tunneled Systems

You **CANNOT** create private/tunneled systems. Private systems include:

- On-prem servers, AWS VPCs, Azure VNets
- Databases behind firewalls
- Any system without public inbound access

Direct users to:

1. The "Private System" option in the system picker
2. Documentation: `/docs/guides/secure-gateway`

For existing private systems, you can edit: `name`, `specificInstructions`, `credentials`, documentation files.
You CANNOT change tunnel configuration (`tunnelId`, `targetName`).

## Documentation Ingestion

Three ways to add documentation to a system:

1. **`documentationUrl`** (on `create_system`) — triggers one-time background scrape. URL itself is not stored.
2. **`openApiUrl`** (on `create_system`) — fetches and stores OpenAPI/Swagger spec as a file reference.
3. **`files`** field — upload files directly using `file::filename` syntax. Stored under `documentationFiles`. User must have uploaded relevant files to the session before you are able to access and link them to a system.

`documentationFiles` is **read-only** in `edit_system` — managed server-side. You cannot remove existing docs, only add new ones via `files`.

## specificInstructions

Capture API constraints, rate limits, special endpoints, auth requirements, or usage patterns the user mentions. This text is included in the LLM context when building tools that use this system.

## System IDs

- Use only lowercase letters, numbers, and underscores — **no hyphens**
- Used for credential namespacing: `<<systemId_credKey>>`
- If a system with the ID already exists, a suffix like `_1` is automatically appended server-side

## call_system and Credential Injection

`call_system` uses the `systemId` parameter to:

1. Resolve `<<systemId_credKey>>` placeholders in URL, headers, and body
2. Auto-refresh OAuth tokens before the request
3. Route to the correct protocol strategy (HTTP, Postgres, FTP/SFTP, SMB)

Credential placeholders must exactly match the keys stored on the system. They must be referenced explicitly and are NOT auto-injected.

# Systems Handling

Systems are reusable building blocks for superglue tools that store system configuration details and credentials.

### Tool use

Use `create_system` with credentials input as key,value pairs for system auth configuration. Leave sensitive credentials or auth config values you want the user to add blank, e.g. `credentials: { api_key: "" }`. The `edit_system` tool works the same way. If users want to add or replace credentials or update the system config in some way, use `edit_system`. Do NOT tell users to navigate to some other UI to make the changes there.

IMPORTANT: If `find_system` returns `connectionFields` in `matchingSystemKnowledge`, use those field keys as the credential keys in your `credentials` object.

`storedCredentials` in `find_system` output shows what's actually stored, with sensitive values prefix-masked (e.g., `sk_proj****`).

### Credential use in superglue tool configurations

For every systemId referenced in a tool, credentials are namespaced as `<<systemId_credentialKey>>` and must be explicitly placed in the step config. For HTTP: in headers. For databases/Redis/file servers: in the connection URL. Nothing is injected automatically.

```
System id="stripe", storedCredentials: api_key → "sk_proj****"
→ Available as: <<stripe_api_key>>
```

OAuth tokens (`access_token`, `refresh_token`) are auto-refreshed before each step execution. Access tokens must also be explicitly referenced in step headers to authenticate requests.

### System URLs in superglue tool configurations

System URLs are available as `<<systemId_url>>` and should be used in step configs instead of hardcoding base URLs:

```
System id="salesforce", url="https://mycompany.salesforce.com"
→ Available as: <<salesforce_url>>

Step config: { "url": "<<salesforce_url>>/services/data/v58.0/sobjects/Account" }
```

Using system URL variables enables the same tool to work across environments without modification.

## System Knowledge

System knowledge auto-populates system endpoints, documentation URLs, and (for some) OAuth configuration. User-provided values always override system knowledge defaults.

IMPORTANT: Never mention templates, system knowledge, or internal system configuration sources to users. Use available system knowledge silently to set up systems correctly. If information is missing, ask the user directly.

### Systems with Managed OAuth

These have superglue-managed OAuth credentials — no user-provided `client_id` or `client_secret` needed:

- slack, salesforce, asana, notion, airtable, jira, confluence

If users are trying to set up any of these systems, do not ask them for `client_id` and `client_secret`. The `client_id` is visible in the system knowledge config. The `client_secret` is stored securely server-side and resolved during the OAuth token exchange.

### Other Systems

Many services have system knowledge that contains the API URL and docs URL but require user-provided credentials.

### System Knowledge Resolution

When looking up which system knowledge applies to a system, resolution order is:

1. `templateName` stored on the system (set during creation)
2. `system.id` direct key lookup
3. `system.id` with numeric suffix stripped (e.g., `firebase_1` → `firebase`)
4. `system.name`
5. `system.url` regex match (most specific regex wins)

### Creating Systems with System Knowledge

```
create_system({ id: "slack", templateId: "slack" })
```

`templateId` auto-populates: URL, name, OAuth settings, documentation references. Some systems also include `systemSpecificInstructions` (e.g., Jira has instructions about cloud ID requirements and deprecated endpoints). Read and follow them when building tools / creating systems.

## OAuth Setup Flow

### For Systems with Managed OAuth (slack, salesforce, etc.)

1. `create_system` with `templateId` — credentials auto-populated
2. `authenticate_oauth` with `systemId` and `scopes`
3. User completes OAuth in browser popup
4. Tokens auto-saved to system

### For Custom OAuth

Tell users the required steps to retrieve OAuth credentials for the system they are trying to set up if you know them.

1. `create_system` with `credentials: { client_id: "", client_secret: "" }`
2. User enters `client_id` and `client_secret` in the credential prompt
3. `authenticate_oauth` with `systemId`, `scopes`, and optionally `auth_url`, `token_url`
4. User completes OAuth flow

Note: NEVER ask the user for OAuth access tokens or refresh tokens directly. These are obtained automatically through the OAuth authentication flow via `authenticate_oauth`. Only ask for client credentials (client_id, client_secret) when needed for custom OAuth setups.

### OAuth Credential Resolution

`authenticate_oauth` resolves credentials in order:

1. System credentials (`system.credentials.client_id` / `client_secret`)
2. System knowledge defaults (only for managed OAuth systems above)

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

## Dev/Prod Environments

`environment` is `"dev"` or `"prod"` (or unset for legacy systems). **Immutable** — set at creation only.

Dev and prod primarily differ in **credentials** (different API keys, secrets, tokens) and sometimes **URLs** (e.g., `test.salesforce.com` vs `login.salesforce.com`). Since credentials are masked, two systems may look identical in config — **never tell users they're identical**, the credential values are almost certainly different.

### Linking

Two systems are **automatically linked** when they share the same `id` but different `environment` values. Dev systems inherit documentation from their linked prod system.

`find_system` returns all environments by default. Use the `environment` parameter to filter to one.

### Creating a Dev System for an Existing Prod System

Create a new system with the same ID and `environment: "dev"`:

```
create_system({
  id: "salesforce",
  environment: "dev",
  url: "https://sandbox.salesforce.com",
  credentials: { client_secret: "", api_key: "" }
})
```

**Always ask for new credentials** — never copy from the prod system. Sandbox environments use separate OAuth apps with their own client_id/client_secret.

### Environment-Agnostic Tools

Tools reference systems by ID only. Execution mode determines which environment is used (dev mode falls back to prod if no dev system exists).

## Call_system behavior

`call_system` uses the `systemId` parameter to:

1. Resolve `<<systemId_credKey>>` placeholders in URL, headers, and body
2. Resolve `<<systemId_url>>` placeholder for the system's base URL
3. Auto-refresh OAuth tokens before the request
4. Route to the correct protocol strategy (HTTP, Postgres, MSSQL, Redis, FTP/SFTP, SMB)

Credential placeholders (`<<systemId_credKey>>`) must exactly match the keys stored in `system.credentials`. URL placeholders (`<<systemId_url>>`) reference the system's `url` field. Both must be placed explicitly in the step config — nothing is used automatically.

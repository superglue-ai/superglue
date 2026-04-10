# Systems Handling

Systems are reusable building blocks for superglue tools that store system configuration details and credentials.

## Credential Model

Two fields in system creation and editing tools, split by purpose:

### `credentials` — OAuth flow metadata and completely insensitive credentials (no secrets, no identifiers)

```
auth_url, token_url, scopes, grant_type, redirect_uri
```

### `sensitiveCredentials` — ALL credential values (client ids, client secrets, api keys, usernames, passwords etc.)

```json
{ "client_id": true, "client_secret": true, "api_key": true }
```

Setting a field to `true` triggers a **secure UI** where the user enters the actual value(s) The agent never sees the raw secrets — only masked placeholders like `<<masked_api_key>>`.

### Credential Use in Tools

For every systemId referenced in a tool, credentials are namespaced as `<<systemId_credentialKey>>` and can be referenced in configs. They are NOT injected automatically but must explicitly be referenced in headers.

```
System id="stripe", sensitiveCredentials stored: api_key
→ Available as: <<stripe_api_key>>
```

OAuth tokens (`access_token`, `refresh_token`) are auto-refreshed before each step execution. Access tokens must also be explicitly referenced in step headers to authenticate requests.

### System URL in Tools

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

### Systems with Template-Provided OAuth Configuration

Some templates may already include non-sensitive OAuth configuration such as URLs, scopes, or a public `client_id`.

If the template does not already provide the OAuth client configuration you need, ask the user to provide `client_id` and `client_secret`.

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

### For Systems with Template-Provided OAuth Configuration

1. `create_system` with `templateId`
2. `authenticate_oauth` with `systemId` and `scopes`
3. User completes OAuth in browser popup
4. Tokens auto-saved to system

### For Custom OAuth

1. `create_system` with `sensitiveCredentials: { client_id: true, client_secret: true }`
2. User enters `client_id` and `client_secret` in secure UI
3. `authenticate_oauth` with `systemId`, `scopes`, and optionally `auth_url`, `token_url`
4. User completes OAuth flow

### OAuth Credential Resolution

`authenticate_oauth` resolves credentials in order:

1. System credentials (`system.credentials.client_id` / `client_secret`)
2. Template-provided OAuth client configuration, if present

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
  sensitiveCredentials: { client_secret: true, api_key: true }
})
```

**Always ask for new credentials** — never copy from the prod system. Sandbox environments use separate OAuth apps with their own client_id/client_secret.

### Environment-Agnostic Tools

Tools reference systems by ID only. Execution mode determines which environment is used (dev mode falls back to prod if no dev system exists).

## call_system and Credential Injection

`call_system` uses the `systemId` parameter to:

1. Resolve `<<systemId_credKey>>` placeholders in URL, headers, and body
2. Resolve `<<systemId_url>>` placeholder for the system's base URL
3. Auto-refresh OAuth tokens before the request
4. Route to the correct protocol strategy (HTTP, Postgres, MSSQL, Redis, FTP/SFTP, SMB)

Credential placeholders (`<<systemId_credKey>>`) must exactly match the keys stored in `system.credentials`. URL placeholders (`<<systemId_url>>`) reference the system's `url` field. Both must be referenced explicitly and are NOT auto-injected.

### SMB Credential Injection

For SMB systems (Windows file shares), credentials must be embedded in the URL:

```json
{
  "systemId": "my_smb_system",
  "url": "smb://<<my_smb_system_username>>:<<my_smb_system_password>>@fileserver.example.com/ShareName",
  "body": "{\"operation\": \"list\", \"path\": \"/\"}"
}
```

Key points:

- Username and password placeholders go **before the `@`** in the URL
- The first path segment after the host is the **share name** (e.g., `ShareName`)
- Additional path segments become the base path for operations

Before making SMB calls, verify with the user:

1. The system credentials have access to the specified share
2. The share name is correct (case-sensitive on some servers)
3. For domain authentication, the username should be stored as `DOMAIN\username`

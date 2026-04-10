# Access Rules (RBAC)

On superglue, roles define tool-level and system-level allowlists. Users can have multiple roles. Roles and access rules are only available on enterprise organizations. Non-enterprise orgs do not have RBAC — all users have admin access on personal organizations.

## Data Model

### Role

```typescript
interface Role {
  id: string;
  name: string;
  description?: string;
  tools: "ALL" | string[]; // tool allowlist
  systems: "ALL" | Record<string, SystemPermission>; // system allowlist
  isBaseRole?: boolean; // true for admin, member, enduser
}
```

### SystemPermission

Each system entry is either a predefined access level or a custom rule:

```typescript
type SystemPermission = SystemAccessLevel | { rules: CustomRule[] };
```

| Type               | Meaning                                          |
| ------------------ | ------------------------------------------------ |
| `"read-write"`     | All HTTP methods allowed                         |
| `"read-only"`      | Only GET and HEAD; POST/PUT/PATCH/DELETE blocked |
| `{ rules: [...] }` | Custom JS expressions that gate access           |

Systems not listed in the role's `systems` map are DENIED, unless the system access is set to `"ALL"`.

### CustomRule

```typescript
interface CustomRule {
  id: string;
  name: string;
  expression?: string; // JS expression, receives stepConfig
  isActive: boolean;
}
```

Custom rules are inline in the systems map. A system either has a standard access level OR a custom rule, never both. Custom rules must return truthy to **allow** the request. If it returns falsy, throws, or has no expression, the request is blocked (fail-closed).

## Tool Permissions

- `tools: "ALL"` — every tool is allowed, including tools created in the future
- `tools: ["tool-id-1", "tool-id-2"]` — only these specific tools are allowed; new tools are NOT auto-included (but see Auto-Append below)

## System Permissions

- `systems: "ALL"` — every system allowed at READ_WRITE level, including future systems. Custom rules are not possible in this mode.
- `systems: { "gmail": "read-write", "stripe": "read-only" }` — SPECIFIC mode: per-system access levels; unlisted systems are denied.
- `systems: { "gmail": { rules: [{ name: "block-deletes", expression: "stepConfig.method !== 'DELETE'", isActive: true }] } }` — custom rule on a specific system

## Mutation Detection by Protocol

Read-only mode blocks mutating requests. How "mutating" is determined per protocol:

- **HTTP** — POST, PUT, PATCH, DELETE are mutating; GET and HEAD are read-only
- **Postgres** — SQL statements starting with or containing INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, etc. are mutating; everything else (SELECT) is read-only
- **FTP / SMB** — operations other than `list`, `get`, `exists`, `stat` are mutating
- **Redis** — commands not in the read-only set (GET, MGET, EXISTS, KEYS, SCAN, TTL, TYPE, HGET, HGETALL, LRANGE, SMEMBERS, SCARD, etc.) are mutating
- **Transform** — never mutating (pure data transformation, no external system)

On parse failure, all protocols default to **mutating** (fail-closed).

## Custom Rule Expressions

Custom rules only apply in SPECIFIC mode. If systems is `"ALL"`, no custom rules exist.

Expressions receive a **resolved** `stepConfig` object — all template variables (`<<variable>>` and `<<(sourceData) => ...>>` expressions) are substituted with their actual runtime values before the rule evaluates. This means rules see the real URL, headers, body, and query params, not raw templates.

```typescript
interface StepConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: unknown;
  systemId: string;
}
```

Example expressions:

```javascript
// Block all POST requests to a specific endpoint
stepConfig.method !== "POST" || !stepConfig.url.includes("/admin");

// Only allow GET requests to /api/v1/read endpoints
stepConfig.method === "GET" && stepConfig.url.includes("/api/v1/read");

// Block requests with certain headers
!stepConfig.headers["x-dangerous-header"];

// Block a specific datasource ID in the resolved body
!(typeof stepConfig.body === "object" && stepConfig.body?.datasource?.id === "blocked-id");
```

## Multi-Role Semantics

Users can have multiple roles. Resolution is **union (most permissive wins) everywhere**:

| Layer        | Semantics                      | Example                                                                     |
| ------------ | ------------------------------ | --------------------------------------------------------------------------- |
| Tools        | Union (most permissive wins)   | If role A allows tool X and role B doesn't, tool X is allowed               |
| Systems      | Union (most permissive wins)   | If role A gives READ_ONLY and role B gives READ_WRITE, result is READ_WRITE |
| Custom rules | Per-role union (any role wins) | If any role's complete rule set allows the request, it goes through         |

Custom rule detail:

- **Within a single role**, all custom rules for that system must pass (AND logic)
- **Across roles**, evaluation is per-role: if any role fully allows the request (all its rules pass, or it has no custom rule for that system), the request is allowed (OR logic)

## Base Roles

Every user has exactly **one** base role. There are three:

- **`admin`** — Full access to everything. Bypasses all RBAC checks. The admin role is **immutable** — it cannot be edited at all, nor can it be re-assigned.
- **`member`** — Default for org team members. Starts with `tools: "ALL"`, `systems: "ALL"`. Tool and system allowlists can be narrowed to restrict access. Name and description cannot be changed. Cannot be deleted.
- **`enduser`** — Default for end users / portal consumers. Starts with `tools: []`, `systems: {}` (no access). Tool and system allowlists must be explicitly populated to grant access. Name and description cannot be changed. Cannot be deleted.

Base roles define the starting permissions that custom roles can extend or build on top of. Users can also have additional **custom roles** on top of their base role. Custom roles are fully editable (name, description, tools, systems) and can be created and deleted.

### Auto-append on resource creation

When a user creates a new tool or system, the backend automatically adds it to the **creator's base role** — but only if that base role uses SPECIFIC mode (not `"ALL"`) for the relevant field:

- New tool created → appended to the creator's base role's `tools` list (skipped if `tools: "ALL"`)
- New system created → appended to the creator's base role's `systems` map with `read-write` access (skipped if `systems: "ALL"`)

This only affects the base role, not additional custom roles. It ensures that a user on a restricted allowlist automatically gets access to resources they create.

# Database Steps

Superglue supports both PostgreSQL and Microsoft SQL Server (including Azure SQL).

## PostgreSQL

### Step Configuration

```typescript
{
  type: "request",
  systemId: "my_postgres_db",
  url: "postgres://<<my_postgres_db_user>>:<<my_postgres_db_password>>@<<my_postgres_db_host>>:<<my_postgres_db_port>>/<<my_postgres_db_database>>",
  body: '{"query": "SELECT * FROM users WHERE id = $1", "params": [<<userId>>]}'
}
```

Configure the connection url depending on which credentials are saved in the stored db system - reference them accordingly.

## URL Format

```
postgres://user:password@host:port/database
postgresql://user:password@host:port/database
```

All credential variables are resolved before connecting. Trailing slashes and extra slashes before query strings are cleaned.

## Body Format

JSON string with `query` and optional `params` (or `values`):

```json
{ "query": "SELECT * FROM users WHERE age > $1 AND status = $2", "params": [25, "active"] }
```

### Parameterized Queries

**Always use parameterized queries** with `$1`, `$2`, etc. — prevents SQL injection.

```json
{ "query": "SELECT * FROM orders WHERE customer_id = $1", "params": ["<<customerId>>"] }
```

With expressions:

```json
{
  "query": "INSERT INTO logs (message, level) VALUES ($1, $2)",
  "params": ["<<(sourceData) => sourceData.message>>", "error"]
}
```

With RETURNING:

```json
{
  "query": "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
  "params": [
    "<<(sourceData) => sourceData.currentItem.name>>",
    "<<(sourceData) => sourceData.currentItem.email>>"
  ]
}
```

## Connection Pooling

- Pools cached by connection string, max 10 clients, 5s connection timeout
- Idle pools cleaned up automatically
- SSL auto-configured: enabled (with `rejectUnauthorized: false`) unless connecting to localhost without explicit sslmode

## Retry Logic

Default retries from server config. On final failure, error includes query text and params.

## Return Value

Returns `result.rows` — array of row objects with column names as keys.

- `SELECT`: array of matching rows
- `INSERT/UPDATE/DELETE` with `RETURNING`: array of returned rows
- Mutations without `RETURNING`: empty array

### Batch Operations via Loop

Use a data selector returning an array to execute a query per item:

```javascript
// dataSelector: (sourceData) => sourceData.newUsers
// body: {"query": "INSERT INTO users (name) VALUES ($1)", "params": ["<<(sourceData) => sourceData.currentItem.name>>"]}
```

---

## Microsoft SQL Server / Azure SQL

### Step Configuration

```typescript
{
  type: "request",
  systemId: "my_azure_sql",
  url: "mssql://<<my_azure_sql_user>>:<<my_azure_sql_password>>@<<my_azure_sql_host>>:<<my_azure_sql_port>>/<<my_azure_sql_database>>",
  body: '{"query": "SELECT * FROM users WHERE id = @param1", "params": [<<userId>>]}'
}
```

Configure the connection url depending on which credentials are saved in the stored db system - reference them accordingly.

### URL Format

```
mssql://user:password@host:port/database
sqlserver://user:password@host:port/database
```

Both `mssql://` and `sqlserver://` protocols are supported. All credential variables are resolved before connecting.

#### Azure SQL Database Connection

For Azure SQL Database, use the fully qualified server name:

```
mssql://myuser:mypassword@myserver.database.windows.net:1433/mydatabase
```

Note: Azure SQL usernames often include `@servername` suffix (e.g., `myuser@myserver`). When using in URLs, encode the @ as `%40`:

```
mssql://myuser%40myserver:mypassword@myserver.database.windows.net:1433/mydatabase
```

You can include connection parameters as query strings:

```
mssql://user:password@host:port/database?encrypt=true&trustServerCertificate=false
```

**Connection Parameters:**

- `encrypt` (default: `true`) - Enable/disable encryption (required for Azure SQL)
- `trustServerCertificate` (default: `false`) - Whether to trust the server certificate
- `database` - Database name (can be in URL path or query parameter)

### Body Format

JSON string with `query` and optional `params` (or `values`):

```json
{
  "query": "SELECT * FROM users WHERE age > @param1 AND status = @param2",
  "params": [25, "active"]
}
```

### Parameterized Queries

**Always use parameterized queries** with `@param1`, `@param2`, etc. — prevents SQL injection.

```json
{ "query": "SELECT * FROM orders WHERE customer_id = @param1", "params": ["<<customerId>>"] }
```

With expressions:

```json
{
  "query": "INSERT INTO logs (message, level) VALUES (@param1, @param2)",
  "params": ["<<(sourceData) => sourceData.message>>", "error"]
}
```

With OUTPUT (MSSQL equivalent of RETURNING):

```json
{
  "query": "INSERT INTO users (name, email) OUTPUT INSERTED.* VALUES (@param1, @param2)",
  "params": [
    "<<(sourceData) => sourceData.currentItem.name>>",
    "<<(sourceData) => sourceData.currentItem.email>>"
  ]
}
```

**Parameter Naming**: MSSQL uses named parameters with `@` prefix. The params array maps positionally: `params[0]` → `@param1`, `params[1]` → `@param2`, etc.

### Connection Pooling

- Pools cached by connection string, max 10 clients per pool
- 5s connection timeout, configurable request timeout
- Idle pools cleaned up automatically
- SSL/TLS encryption enabled by default for Azure SQL

### Retry Logic

Default retries from server config. On final failure, error includes query text and params.

### Return Value

Returns the recordset — array of row objects with column names as keys.

- `SELECT`: array of matching rows
- `INSERT/UPDATE/DELETE` with `OUTPUT`: array of returned rows
- Mutations without `OUTPUT`: empty array

### Batch Operations via Loop

Use a data selector returning an array to execute a query per item:

```javascript
// dataSelector: (sourceData) => sourceData.newUsers
// body: {"query": "INSERT INTO users (name) VALUES (@param1)", "params": ["<<(sourceData) => sourceData.currentItem.name>>"]}
```

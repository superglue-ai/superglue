# Database Steps (PostgreSQL)

## Step Configuration

```typescript
{
  type: "request",
  systemId: "my_postgres_db",
  url: "postgres://<<my_postgres_db_user>>:<<my_postgres_db_password>>@<<my_postgres_db_host>>:<<my_postgres_db_port>>/<<my_postgres_db_database>>",
  method: "POST",            // ignored for Postgres but required by schema
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

## Batch Operations via Loop

Use a data selector returning an array to execute a query per item:

```javascript
// dataSelector: (sourceData) => sourceData.newUsers
// body: {"query": "INSERT INTO users (name) VALUES ($1)", "params": ["<<(sourceData) => sourceData.currentItem.name>>"]}
```

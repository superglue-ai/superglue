# Redis Steps

## Step Configuration

```typescript
{
  type: "request",
  systemId: "my_redis",
  url: "redis://<<my_redis_username>>:<<my_redis_password>>@<<my_redis_host>>:<<my_redis_port>>/<<my_redis_database>>",
  method: "POST",            // ignored for Redis but required by schema
  body: '{"command": "GET", "args": ["<<keyName>>"]}'
}
```

Configure the connection URL depending on which credentials are saved in the stored Redis system - reference them accordingly.

## URL Format

```
redis://user:password@host:port/database
rediss://user:password@host:port/database   (TLS)
```

- `redis://` for standard connections
- `rediss://` for TLS-encrypted connections (e.g. Redis Cloud, AWS ElastiCache with encryption)
- `/database` is the database number (defaults to 0 if omitted; max depends on the server's `databases` config, commonly 16)

All credential variables are resolved before connecting. Trailing slashes are cleaned.

## Body Format

JSON string with `command` (required) and optional `args` array. Body can be a single command object or an array of commands (pipelined in a single round-trip):

```json
{ "command": "GET", "args": ["mykey"] }
```

Multiple commands:

```json
[
  { "command": "GET", "args": ["user:1:name"] },
  { "command": "HGETALL", "args": ["user:1"] }
]
```

### Common Commands

**String operations:**

```json
{ "command": "GET", "args": ["user:123:name"] }
{ "command": "SET", "args": ["user:123:name", "Alice"] }
{ "command": "MGET", "args": ["key1", "key2", "key3"] }
{ "command": "INCR", "args": ["counter"] }
```

**Hash operations:**

```json
{ "command": "HGETALL", "args": ["user:123"] }
{ "command": "HGET", "args": ["user:123", "email"] }
{ "command": "HSET", "args": ["user:123", "email", "alice@example.com"] }
{ "command": "HMGET", "args": ["user:123", "name", "email"] }
```

**List operations:**

```json
{ "command": "LRANGE", "args": ["queue:tasks", "0", "-1"] }
{ "command": "LPUSH", "args": ["queue:tasks", "task1"] }
{ "command": "RPOP", "args": ["queue:tasks"] }
{ "command": "LLEN", "args": ["queue:tasks"] }
```

**Set operations:**

```json
{ "command": "SMEMBERS", "args": ["tags:post:1"] }
{ "command": "SADD", "args": ["tags:post:1", "redis", "database"] }
{ "command": "SISMEMBER", "args": ["tags:post:1", "redis"] }
```

**Sorted set operations:**

```json
{ "command": "ZRANGE", "args": ["leaderboard", "0", "-1", "WITHSCORES"] }
{ "command": "ZADD", "args": ["leaderboard", "100", "player1"] }
{ "command": "ZRANK", "args": ["leaderboard", "player1"] }
```

**Key operations:**

```json
{ "command": "KEYS", "args": ["user:*"] }
{ "command": "EXISTS", "args": ["mykey"] }
{ "command": "TTL", "args": ["session:abc"] }
{ "command": "EXPIRE", "args": ["session:abc", "3600"] }
{ "command": "DEL", "args": ["mykey"] }
{ "command": "TYPE", "args": ["mykey"] }
```

**Scan (safe iteration):**

```json
{ "command": "SCAN", "args": ["0", "MATCH", "user:*", "COUNT", "100"] }
{ "command": "HSCAN", "args": ["myhash", "0", "MATCH", "field*"] }
```

### Dynamic Arguments with Variables

```json
{ "command": "GET", "args": ["<<(sourceData) => `user:${sourceData.userId}:profile`>>"] }
```

```json
{ "command": "HSET", "args": ["<<userKey>>", "<<fieldName>>", "<<fieldValue>>"] }
```

## Connection Management

- A fresh connection is created per execution and closed after completion
- TLS auto-configured for `rediss://` URLs (certificate verification enabled by default; set `REDIS_TLS_REJECT_UNAUTHORIZED=false` to disable)
- 5-second connection timeout, 30-second command timeout
- Array commands (pipeline) run on a single connection for efficiency

## Retry Logic

Default retries from server config. On final failure, error includes command and args.

## Return Value

Returns the raw Redis response:

- `GET` / `HGET`: string or null
- `HGETALL`: flat array of alternating field-value pairs (e.g., `["name", "Alice", "email", "alice@example.com"]`)
- `LRANGE` / `SMEMBERS` / `KEYS`: array of strings
- `SET` / `DEL` / `EXPIRE`: "OK" or integer
- `INCR` / `LLEN` / `SADD`: integer
- `MGET` / `HMGET`: array (nulls for missing keys)
- `SCAN` / `HSCAN`: array of [cursor, results]

## Multiple Commands (Pipeline)

Pass an array of commands to execute them in a single round-trip (like FTP/SFTP batch operations):

```json
[
  { "command": "GET", "args": ["user:1:name"] },
  { "command": "HGETALL", "args": ["user:1"] },
  { "command": "LRANGE", "args": ["tasks", "0", "-1"] }
]
```

Returns an array of results, one per command:

```json
[
  { "command": "GET", "result": "Alice" },
  { "command": "HGETALL", "result": ["name", "Alice", "email", "alice@example.com"] },
  { "command": "LRANGE", "result": ["task3", "task2", "task1"] }
]
```

If an individual command fails, that entry has `error` instead of `result`:

```json
[
  { "command": "GET", "result": "Alice" },
  { "command": "WRONGCMD", "error": "ERR unknown command 'WRONGCMD'" }
]
```

A single command returns a single result. Multiple commands return an array — same pattern as FTP/SFTP operations.

## Batch Operations via Loop

Use a data selector returning an array to execute a command per item:

```javascript
// dataSelector: (sourceData) => sourceData.userIds
// body: {"command": "HGETALL", "args": ["<<(sourceData) => `user:${sourceData.currentItem}`>>"]}
```

## Important Notes

- All args must be strings (Redis protocol is text-based) - numbers are auto-coerced
- Use `SCAN` instead of `KEYS` in production for large keyspaces
- `HGETALL` returns an empty array `[]` for non-existent keys
- Use array body for multi-command pipelines instead of separate steps

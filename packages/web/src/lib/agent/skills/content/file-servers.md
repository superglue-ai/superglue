# File Server Steps (FTP / SFTP / SMB)

FTP, SFTP, and SMB share an identical operation interface. Only the URL protocol and connection details differ.

## URL Formats

```
ftp://user:password@host:port/basePath       (port 21)
ftps://user:password@host:port/basePath      (port 21, TLS)
sftp://user:password@host:port/basePath      (port 22)
smb://user:password@host/sharename/basePath  (port 445)
smb://domain\user:password@host/sharename/   (domain auth)
```

All support `<<variable>>` syntax in the URL. **For password-based auth, explicitly include credentials in the connection URL** using `<<systemId_username>>` and `<<systemId_password>>` placeholders (e.g. `sftp://<<mySystem_username>>:<<mySystem_password>>@host/path`). Authentication is never automatic. For SFTP private-key auth, use `credentials.privateKey`/`credentials.passphrase` instead of URL placeholders.

SMB requires a share name as the first path segment. Additional segments become a base path prepended to all operation paths.

## System Credentials

Only store connection credentials: `host`, `port`, `username`, `password`, `privateKey`, `passphrase`, `domain` (SMB), `home_dir`. Paths and share names belong in the URL, not credentials.

## Path Handling

**All operation paths are relative to the base path in the URL.** Do NOT use absolute filesystem paths.

If the system URL is `sftp://user:pass@host/home/sftptest/uploads`:

- `report.csv` → `/home/sftptest/uploads/report.csv`
- `subdir/data.csv` → `/home/sftptest/uploads/subdir/data.csv`

Do NOT use `/home/sftptest/uploads/report.csv` — the base path is already set in the URL.

If the URL has no base path (e.g., `sftp://user:pass@host`), operation paths are used as-is from the server root.

## Body Format

JSON string — single operation or array of operations (batch):

### Single

```json
{ "operation": "get", "path": "data/report.csv" }
```

### Batch (sequential, same connection)

```json
[
  { "operation": "mkdir", "path": "backup" },
  { "operation": "get", "path": "data/report.csv" },
  { "operation": "put", "path": "backup/report.csv", "content": "data here" }
]
```

## Supported Operations

| Operation | Required fields   | Returns                                                                 |
| --------- | ----------------- | ----------------------------------------------------------------------- |
| `list`    | `path`            | Array of `{ name, path, size, type, modifyTime, ... }`                  |
| `get`     | `path`            | Auto-parsed file content (CSV→objects, JSON→parsed, etc.) or raw string |
| `put`     | `path`, `content` | `{ success, message, size }`                                            |
| `delete`  | `path`            | `{ success, message }`                                                  |
| `rename`  | `path`, `newPath` | `{ success, message }`                                                  |
| `mkdir`   | `path`            | `{ success, message }`                                                  |
| `rmdir`   | `path`            | `{ success, message }`                                                  |
| `exists`  | `path`            | `{ exists: boolean, path }`                                             |
| `stat`    | `path`            | File metadata or `{ exists: false }`                                    |

### `get` — Step File Keys

Downloaded files are added to the runtime file store. See the file-handling skill for the full reference on file detection, aliasing, and the `RuntimeExecutionFile` shape.

- `data` contains the auto-parsed content (CSV -> objects, JSON -> parsed, PDF -> structured, etc.)
- the step result exposes `stepFileKeys`
- later steps can reference downloaded files via `file::<stepId>.raw` (exact bytes), `file::<stepId>.base64` (base64 string), or `file::<stepId>.extracted` (parsed content)
- for multi-file operations, use bracket notation: `file::<stepId>["report.csv"].raw`

### `put` — Content Handling

- `RawFileBytes` (from `file::<key>.raw`) → written as exact original bytes
- String → written as-is
- Buffer → written directly
- Object/Array → JSON.stringified with 2-space indent

## Connection Details

### SFTP

Uses `ssh2-sftp-client`. Supports password + private key auth (`credentials.privateKey`, `credentials.passphrase`).

### FTP/FTPS

Uses `basic-ftp`. FTPS uses TLS with `rejectUnauthorized: false`.

### SMB

Uses `@awo00/smb2`. Connection lifecycle: create client → authenticate (domain optional) → connect tree (share) → execute → disconnect/logoff/close. Entire operation wrapped in timeout race.

All paths use forward slashes (`/`) — SMB library handles Windows conversion internally.

Credentials must be injected into the URL using placeholders:

```
smb://<<systemId_username>>:<<systemId_password>>@fileserver.example.com/ShareName
```

For private systems via Secure Gateway, the host is `tunnelId.tunnel` (e.g., `my_tunnel.tunnel`).

## Return Value

Single operation → result directly. Multiple operations → array of results.

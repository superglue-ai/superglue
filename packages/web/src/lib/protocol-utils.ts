import { Server, Database, HardDrive, FolderOpen, Network } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Protocol =
  | "http"
  | "https"
  | "postgres"
  | "postgresql"
  | "mssql"
  | "sqlserver"
  | "redis"
  | "rediss"
  | "sftp"
  | "ftp"
  | "ftps"
  | "smb";

/**
 * Normalize protocol string to canonical form
 */
export function normalizeProtocol(protocol: string): string {
  return protocol.toLowerCase().trim();
}

/**
 * Get the React icon component for a protocol
 */
export function getProtocolIcon(protocol: string): LucideIcon {
  switch (normalizeProtocol(protocol)) {
    case "http":
    case "https":
      return Server;
    case "postgres":
    case "postgresql":
    case "mssql":
    case "sqlserver":
    case "redis":
    case "rediss":
      return Database;
    case "sftp":
    case "ftp":
    case "ftps":
      return HardDrive;
    case "smb":
      return FolderOpen;
    default:
      return Network;
  }
}

/**
 * Get the Lucide icon name string for storing in database
 */
export function getProtocolIconName(protocol: string): string {
  switch (normalizeProtocol(protocol)) {
    case "http":
    case "https":
      return "lucide:server";
    case "postgres":
    case "postgresql":
    case "mssql":
    case "sqlserver":
    case "redis":
    case "rediss":
      return "lucide:database";
    case "sftp":
    case "ftp":
    case "ftps":
      return "lucide:hard-drive";
    case "smb":
      return "lucide:folder-open";
    default:
      return "lucide:network";
  }
}

/**
 * Get human-readable label for a protocol
 */
export function getProtocolLabel(protocol: string): string {
  switch (normalizeProtocol(protocol)) {
    case "http":
      return "HTTP";
    case "https":
      return "HTTPS";
    case "postgres":
    case "postgresql":
      return "PostgreSQL";
    case "mssql":
    case "sqlserver":
      return "Microsoft SQL Server";
    case "redis":
      return "Redis";
    case "rediss":
      return "Redis (TLS)";
    case "sftp":
      return "SFTP";
    case "ftp":
      return "FTP";
    case "ftps":
      return "FTPS";
    case "smb":
      return "Windows Share (SMB)";
    default:
      return protocol.toUpperCase();
  }
}

/**
 * Generate specific instructions for tunnel systems based on protocol
 */
export function generateTunnelInstructions(systemUrl: string, protocol: string): string {
  const baseInstruction = `This system is connected via a Secure Gateway (on-premises tunnel agent). The URL will be automatically routed through the tunnel in the backend.`;

  switch (normalizeProtocol(protocol)) {
    case "sftp":
    case "ftp":
    case "ftps":
      return `${baseInstruction}

For ${protocol.toUpperCase()} operations, use JSON body with operation and path:
- List files: {"operation": "list", "path": "/"}
- Download: {"operation": "get", "path": "/path/to/file.txt"}
- Upload: {"operation": "put", "path": "/path/to/file.txt", "content": "file contents"}
- Delete: {"operation": "delete", "path": "/path/to/file.txt"}
- Check exists: {"operation": "exists", "path": "/path/to/file.txt"}
- Get file info: {"operation": "stat", "path": "/path/to/file.txt"}
- Create directory: {"operation": "mkdir", "path": "/path/to/dir"}
- Remove directory: {"operation": "rmdir", "path": "/path/to/dir"}`;

    case "postgres":
    case "postgresql":
    case "mssql":
    case "sqlserver":
      return `${baseInstruction}

For database queries, use the system URL "${systemUrl}" as the connection string. Include credentials in the URL or system credentials.`;

    case "redis":
    case "rediss":
      return `${baseInstruction}

For Redis commands, use the system URL "${systemUrl}" as the connection string. Use JSON body with command and args:
- Get: {"command": "GET", "args": ["key"]}
- Set: {"command": "SET", "args": ["key", "value"]}
- Hash: {"command": "HGETALL", "args": ["hashkey"]}
- List: {"command": "LRANGE", "args": ["listkey", "0", "-1"]}`;

    case "smb":
      return `${baseInstruction}

For SMB/Windows file share operations, use JSON body similar to SFTP:
- List: {"operation": "list", "path": "/share/folder"}
- Get: {"operation": "get", "path": "/share/folder/file.txt"}
- Put: {"operation": "put", "path": "/share/folder/file.txt", "content": "..."}

The hostname must always be \`<tunnelId>.tunnel\` (e.g., \`smb://acme-corp.tunnel/share\`) - this cannot be changed or the connection will fail.`;

    default:
      return `${baseInstruction}

When building and calling this system, use "${systemUrl}" as the base URL and append any path suffix as needed (e.g., "${systemUrl}/api/v1/users").`;
  }
}

/**
 * Convert snake_case or kebab-case to Title Case
 * e.g., "local_http" -> "Local Http", "my-database" -> "My Database"
 */
export function toTitleCase(str: string): string {
  return str.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

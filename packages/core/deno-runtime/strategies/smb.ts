/**
 * SMB Strategy for Deno runtime
 *
 * Uses npm:@awo00/smb2 for SMB connections.
 */

import smb2 from "npm:@awo00/smb2";
import { Buffer } from "node:buffer";
import type {
  RequestStepConfig,
  RequestOptions,
  ServiceMetadata,
  StepExecutionResult,
} from "../types.ts";
import { DENO_DEFAULTS } from "../types.ts";
import { replaceVariables } from "../utils/transform.ts";
import { parseJSON, parseFile } from "../utils/files.ts";
import { debug } from "../utils/logging.ts";

// Type aliases for internal smb2 types
type SMBClient = InstanceType<typeof smb2.Client>;
type SMBSession = Awaited<ReturnType<SMBClient["authenticate"]>>;
type SMBTree = Awaited<ReturnType<SMBSession["connectTree"]>>;

const SUPPORTED_OPERATIONS = [
  "list",
  "get",
  "put",
  "delete",
  "rename",
  "mkdir",
  "rmdir",
  "exists",
  "stat",
];

interface SMBOperation {
  operation: "list" | "get" | "put" | "delete" | "rename" | "mkdir" | "rmdir" | "exists" | "stat";
  path?: string;
  content?: string | Uint8Array;
  newPath?: string;
}

/**
 * Execute an SMB step
 */
export async function executeSmbStep(
  config: RequestStepConfig,
  payload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  options: RequestOptions,
  metadata: ServiceMetadata,
): Promise<StepExecutionResult> {
  try {
    const result = await callSMB({
      endpoint: config,
      stepInputData: payload,
      credentials,
      options,
      metadata,
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Parse SMB connection URL
 */
function parseSMBConnectionUrl(urlString: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  domain?: string;
  share: string;
  basePath?: string;
} {
  if (!urlString.startsWith("smb://")) {
    throw new Error("Invalid URL: protocol must be smb");
  }

  let processedUrl = urlString;
  let domain: string | undefined;

  // Extract domain if present (domain\user format)
  const domainMatch = urlString.match(/^smb:\/\/([^\\:@]+)\\([^:@]+)/);
  if (domainMatch) {
    domain = domainMatch[1];
    processedUrl = urlString.replace(`${domain}\\`, "");
  }

  let url: URL;

  try {
    url = new URL(processedUrl);
  } catch (error) {
    const protocolMatch = processedUrl.match(/^smb:\/\//);
    if (!protocolMatch) {
      throw new Error("Invalid URL: protocol must be smb");
    }

    const afterProtocol = processedUrl.slice(protocolMatch[0].length);
    const lastAtIndex = afterProtocol.lastIndexOf("@");

    if (lastAtIndex === -1) {
      throw new Error(`Invalid URL format: ${(error as Error).message}`);
    }

    const credentials = afterProtocol.slice(0, lastAtIndex);
    const hostAndPath = afterProtocol.slice(lastAtIndex + 1);
    const colonIndex = credentials.indexOf(":");

    const username =
      colonIndex !== -1
        ? encodeURIComponent(credentials.slice(0, colonIndex))
        : encodeURIComponent(credentials);
    const password =
      colonIndex !== -1 ? encodeURIComponent(credentials.slice(colonIndex + 1)) : undefined;

    const encodedUrl = password
      ? `${protocolMatch[0]}${username}:${password}@${hostAndPath}`
      : `${protocolMatch[0]}${username}@${hostAndPath}`;

    url = new URL(encodedUrl);
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.length === 0) {
    throw new Error("SMB URL must include a share name (e.g., smb://host/sharename)");
  }

  const share = pathParts[0];
  const basePath = pathParts.length > 1 ? "/" + pathParts.slice(1).join("/") : undefined;

  const safeDecodeURIComponent = (str: string): string => {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  };

  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port) : 445,
    username: url.username ? safeDecodeURIComponent(url.username) : undefined,
    password: url.password ? safeDecodeURIComponent(url.password) : undefined,
    domain,
    share,
    basePath,
  };
}

/**
 * Normalize path
 */
function normalizePath(basePath: string | undefined, operationPath: string | undefined): string {
  let fullPath = operationPath || "/";

  if (basePath) {
    if (fullPath === "/") {
      fullPath = basePath;
    } else {
      fullPath = basePath + (fullPath.startsWith("/") ? "" : "/") + fullPath;
    }
  }

  if (!fullPath.startsWith("/")) {
    fullPath = "/" + fullPath;
  }

  return fullPath;
}

/**
 * Convert content to Buffer
 */
function contentToBuffer(content: string | Uint8Array | unknown): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  return new TextEncoder().encode(JSON.stringify(content, null, 2));
}

/**
 * Execute SMB operation
 */
async function executeSMBOperation(
  tree: SMBTree,
  operation: SMBOperation,
  basePath: string | undefined,
): Promise<unknown> {
  const fullPath = normalizePath(basePath, operation.path);

  switch (operation.operation) {
    case "list": {
      const entries = await tree.readDirectory(fullPath);
      // deno-lint-ignore no-explicit-any
      return (entries as any[]).map(
        (entry: {
          filename: string;
          fileSize: bigint;
          type: string;
          creationTime?: Date;
          lastWriteTime?: Date;
          lastAccessTime?: Date;
        }) => {
          const name = entry.filename.startsWith("./") ? entry.filename.slice(2) : entry.filename;
          return {
            name,
            path: fullPath + (fullPath.endsWith("/") ? "" : "/") + name,
            size: Number(entry.fileSize),
            type: entry.type === "Directory" ? "directory" : "file",
            createdAt: entry.creationTime?.toISOString() || null,
            modifyTime: entry.lastWriteTime?.toISOString() || null,
            accessTime: entry.lastAccessTime?.toISOString() || null,
          };
        },
      );
    }

    case "get": {
      if (!operation.path) throw new Error("path required for get operation");
      const content = await tree.readFile(fullPath);

      try {
        return await parseFile(new Uint8Array(content), "AUTO");
      } catch {
        // Check if binary
        const sample = content.slice(0, Math.min(8000, content.length));
        let nonPrintable = 0;
        for (let i = 0; i < sample.length; i++) {
          const byte = sample[i];
          if (byte === 0) {
            return {
              _binary: true,
              encoding: "base64",
              data: Buffer.from(content).toString("base64"),
              size: content.length,
              path: fullPath,
            };
          }
          if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            nonPrintable++;
          }
        }
        if (nonPrintable / sample.length > 0.1) {
          return {
            _binary: true,
            encoding: "base64",
            data: Buffer.from(content).toString("base64"),
            size: content.length,
            path: fullPath,
          };
        }
        return new TextDecoder().decode(content);
      }
    }

    case "put": {
      if (!operation.path) throw new Error("path required for put operation");
      if (operation.content === undefined || operation.content === null) {
        throw new Error("content required for put operation");
      }
      const buffer = contentToBuffer(operation.content);
      await tree.createFile(fullPath, Buffer.from(buffer));
      return {
        success: true,
        message: `Uploaded content to ${fullPath}`,
        size: buffer.length,
      };
    }

    case "delete": {
      if (!operation.path) throw new Error("path required for delete operation");
      await tree.removeFile(fullPath);
      return { success: true, message: `Deleted ${fullPath}` };
    }

    case "rename": {
      if (!operation.path || !operation.newPath) {
        throw new Error("Both path and newPath required for rename operation");
      }
      const newFullPath = normalizePath(basePath, operation.newPath);
      await tree.renameFile(fullPath, newFullPath);
      return { success: true, message: `Renamed ${fullPath} to ${newFullPath}` };
    }

    case "mkdir": {
      if (!operation.path) throw new Error("path required for mkdir operation");
      await tree.createDirectory(fullPath);
      return { success: true, message: `Created directory ${fullPath}` };
    }

    case "rmdir": {
      if (!operation.path) throw new Error("path required for rmdir operation");
      await tree.removeDirectory(fullPath);
      return { success: true, message: `Removed directory ${fullPath}` };
    }

    case "exists": {
      if (!operation.path) throw new Error("path required for exists operation");
      const exists = await tree.exists(fullPath);
      return { exists, path: fullPath };
    }

    case "stat": {
      if (!operation.path) throw new Error("path required for stat operation");
      try {
        const exists = await tree.exists(fullPath);
        if (!exists) {
          return { exists: false, path: fullPath };
        }

        if (fullPath === "/" || fullPath === "") {
          return { exists: true, path: fullPath, name: "/", type: "directory" };
        }

        const lastSlashIndex = fullPath.lastIndexOf("/");
        const parentPath = lastSlashIndex > 0 ? fullPath.substring(0, lastSlashIndex) : "/";
        const fileName = fullPath.substring(lastSlashIndex + 1);

        if (!fileName) {
          return {
            exists: true,
            path: fullPath,
            name: fullPath.split("/").filter(Boolean).pop() || "/",
            type: "directory",
          };
        }

        const entries = await tree.readDirectory(parentPath);
        const entry = entries.find(
          (e: { filename: string }) => e.filename === fileName || e.filename === `./${fileName}`,
        );

        if (!entry) {
          return { exists: false, path: fullPath };
        }

        return {
          exists: true,
          path: fullPath,
          name: entry.filename.startsWith("./") ? entry.filename.slice(2) : entry.filename,
          size: Number(entry.fileSize),
          type: entry.type === "Directory" ? "directory" : "file",
          createdAt: entry.creationTime?.toISOString() || null,
          modifyTime: entry.lastWriteTime?.toISOString() || null,
          accessTime: entry.lastAccessTime?.toISOString() || null,
        };
      } catch {
        return { exists: false, path: fullPath };
      }
    }

    default:
      throw new Error(
        `Unsupported SMB operation: '${(operation as SMBOperation).operation}'. Supported: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
  }
}

/**
 * Main SMB call function
 */
async function callSMB({
  endpoint,
  stepInputData,
  credentials,
  options,
  metadata,
}: {
  endpoint: RequestStepConfig;
  stepInputData?: Record<string, unknown>;
  credentials: Record<string, unknown>;
  options: RequestOptions;
  metadata: ServiceMetadata;
}): Promise<unknown> {
  const allVars = { ...stepInputData, ...credentials };

  const connectionString = await replaceVariables(endpoint.url || "", allVars, metadata);
  const connectionInfo = parseSMBConnectionUrl(connectionString);

  let operations: SMBOperation[] = [];
  try {
    const resolvedBody = await replaceVariables(endpoint.body || "", allVars, metadata);
    const body = parseJSON(resolvedBody);
    if (!Array.isArray(body)) {
      operations.push(body as SMBOperation);
    } else {
      operations = body as SMBOperation[];
    }
  } catch (error) {
    throw new Error(
      `Invalid JSON in body: ${(error as Error).message}. Supported operations: ${SUPPORTED_OPERATIONS.join(", ")}`,
    );
  }

  if (operations.length === 0) {
    throw new Error(
      `No operations provided. Supported operations: ${SUPPORTED_OPERATIONS.join(", ")}`,
    );
  }

  for (const operation of operations) {
    if (!operation.operation) {
      throw new Error(
        `Missing 'operation' field. Supported operations: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
    }
    if (!SUPPORTED_OPERATIONS.includes(operation.operation)) {
      throw new Error(
        `Unsupported operation: '${operation.operation}'. Supported: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
    }
  }

  let attempts = 0;
  let results: unknown[] = [];
  const maxRetries = options?.retries || DENO_DEFAULTS.SMB.DEFAULT_RETRIES;
  const timeout = options?.timeout || DENO_DEFAULTS.SMB.DEFAULT_TIMEOUT;

  while (attempts <= maxRetries) {
    let client: SMBClient | null = null;
    let session: SMBSession | null = null;
    let tree: SMBTree | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`SMB operation timed out after ${timeout}ms`)), timeout);
      });

      const operationPromise = (async () => {
        client = new smb2.Client(connectionInfo.host, { port: connectionInfo.port });

        session = await client.authenticate({
          domain: connectionInfo.domain || (credentials.domain as string) || "",
          username: connectionInfo.username || (credentials.username as string),
          password: connectionInfo.password || (credentials.password as string),
        });

        tree = await session.connectTree(connectionInfo.share);

        const opResults: unknown[] = [];
        for (const operation of operations) {
          debug(`Executing SMB operation: ${operation.operation}`, metadata);
          const result = await executeSMBOperation(tree, operation, connectionInfo.basePath);
          opResults.push(result);
        }
        return opResults;
      })();

      results = await Promise.race([operationPromise, timeoutPromise]);
      break;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        const errorContext = ` for operations: ${JSON.stringify(operations)}`;
        throw new Error(`SMB error: ${(error as Error).message}${errorContext}`);
      }

      const retryDelay = options?.retryDelay || DENO_DEFAULTS.SMB.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    } finally {
      try {
        // deno-lint-ignore no-explicit-any
        if (tree) await (tree as any).disconnect();
        // deno-lint-ignore no-explicit-any
        if (session) await (session as any).logoff();
        // deno-lint-ignore no-explicit-any
        if (client) await (client as any).close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return results.length === 1 ? results[0] : results;
}

import {
  RequestOptions,
  ServiceMetadata,
  RequestStepConfig,
  SupportedFileType,
} from "@superglue/shared";
import smb2 from "@awo00/smb2";
import { server_defaults } from "../../../default.js";
import { parseFile, parseJSON } from "../../../files/index.js";
import { replaceVariables } from "../../../utils/helpers.js";
import { logMessage } from "../../../utils/logs.js";
import {
  StepExecutionInput,
  StepExecutionStrategy,
  StepStrategyExecutionResult,
} from "../strategy.js";

// Type aliases for internal smb2 types (not exported from package)
type SMBClient = InstanceType<typeof smb2.Client>;
type SMBSession = Awaited<ReturnType<SMBClient["authenticate"]>>;
type SMBTree = Awaited<ReturnType<SMBSession["connectTree"]>>;

export class SMBStepExecutionStrategy implements StepExecutionStrategy {
  readonly version = "1.0.0";

  shouldExecute(resolvedUrlHost: string): boolean {
    return resolvedUrlHost.startsWith("smb://");
  }

  async executeStep(input: StepExecutionInput): Promise<StepStrategyExecutionResult> {
    const { stepConfig, stepInputData, credentials, requestOptions, metadata } = input;
    const smbResult = await callSMB({
      endpoint: stepConfig as RequestStepConfig,
      stepInputData,
      credentials,
      options: requestOptions,
      metadata,
    });
    return {
      success: true,
      strategyExecutionData: smbResult,
    };
  }
}

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
  content?: string | Buffer;
  newPath?: string;
}

function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

function contentToBuffer(content: string | Buffer | any): Buffer {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (typeof content === "string") {
    return Buffer.from(content, "utf8");
  }
  return Buffer.from(JSON.stringify(content, null, 2), "utf8");
}

export function parseSMBConnectionUrl(urlString: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  domain?: string;
  share: string;
  basePath?: string;
} {
  // Check protocol first
  if (!urlString.startsWith("smb://")) {
    throw new Error("Invalid URL: protocol must be smb");
  }

  // Handle domain\user format before URL parsing
  // Format: smb://[domain\]user:pass@host[:port]/share[/path]
  let processedUrl = urlString;
  let domain: string | undefined;

  // Extract domain if present (domain\user format)
  const domainMatch = urlString.match(/^smb:\/\/([^\\:@]+)\\([^:@]+)/);
  if (domainMatch) {
    domain = domainMatch[1];
    // Replace domain\user with just user for URL parsing
    processedUrl = urlString.replace(`${domain}\\`, "");
  }

  let url: URL;

  try {
    url = new URL(processedUrl);
  } catch (error) {
    // Handle special characters in credentials
    const protocolMatch = processedUrl.match(/^smb:\/\//);
    if (!protocolMatch) {
      throw new Error("Invalid URL: protocol must be smb");
    }

    const afterProtocol = processedUrl.slice(protocolMatch[0].length);
    const lastAtIndex = afterProtocol.lastIndexOf("@");

    if (lastAtIndex === -1) {
      throw new Error(`Invalid URL format: ${error.message}`);
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

  // Extract share name from pathname (first segment)
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.length === 0) {
    throw new Error("SMB URL must include a share name (e.g., smb://host/sharename)");
  }

  const share = pathParts[0];
  const basePath = pathParts.length > 1 ? "/" + pathParts.slice(1).join("/") : undefined;

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

// Normalize path to use forward slashes and ensure it starts with /
function normalizePath(basePath: string | undefined, operationPath: string | undefined): string {
  let fullPath = operationPath || "/";

  // Prepend base path if present
  if (basePath) {
    if (fullPath === "/") {
      fullPath = basePath;
    } else {
      fullPath = basePath + (fullPath.startsWith("/") ? "" : "/") + fullPath;
    }
  }

  // Ensure path starts with /
  if (!fullPath.startsWith("/")) {
    fullPath = "/" + fullPath;
  }

  return fullPath;
}

async function executeSMBOperation(
  tree: SMBTree,
  operation: SMBOperation,
  basePath: string | undefined,
): Promise<any> {
  const fullPath = normalizePath(basePath, operation.path);

  switch (operation.operation) {
    case "list": {
      const entries = await tree.readDirectory(fullPath);
      return entries.map((entry) => {
        // Library returns filenames with ./ prefix, strip it
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
      });
    }

    case "get": {
      if (!operation.path) throw new Error("path required for get operation");
      const content = await tree.readFile(fullPath);

      // Try to parse as a known file type first
      try {
        return await parseFile(content, SupportedFileType.AUTO);
      } catch {
        // Check if content appears to be binary (contains null bytes or high ratio of non-printable chars)
        const isBinary = (() => {
          const sample = content.slice(0, Math.min(8000, content.length));
          let nonPrintable = 0;
          for (let i = 0; i < sample.length; i++) {
            const byte = sample[i];
            // Null byte is a strong indicator of binary
            if (byte === 0) return true;
            // Count non-printable, non-whitespace characters
            if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
              nonPrintable++;
            }
          }
          // If more than 10% non-printable, likely binary
          return nonPrintable / sample.length > 0.1;
        })();

        if (isBinary) {
          return {
            _binary: true,
            encoding: "base64",
            data: content.toString("base64"),
            size: content.length,
            path: fullPath,
          };
        }

        return content.toString("utf8");
      }
    }

    case "put": {
      if (!operation.path) throw new Error("path required for put operation");
      if (operation.content === undefined || operation.content === null) {
        throw new Error("content required for put operation");
      }

      const buffer = contentToBuffer(operation.content);
      await tree.createFile(fullPath, buffer);

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

        // Handle root path - can't get parent of root
        if (fullPath === "/" || fullPath === "") {
          return {
            exists: true,
            path: fullPath,
            name: "/",
            type: "directory",
          };
        }

        // Try to get file info by reading directory of parent
        const lastSlashIndex = fullPath.lastIndexOf("/");
        const parentPath = lastSlashIndex > 0 ? fullPath.substring(0, lastSlashIndex) : "/";
        const fileName = fullPath.substring(lastSlashIndex + 1);

        if (!fileName) {
          // Path ends with slash, treat as directory
          return {
            exists: true,
            path: fullPath,
            name: fullPath.split("/").filter(Boolean).pop() || "/",
            type: "directory",
          };
        }

        const entries = await tree.readDirectory(parentPath);
        // Library returns filenames with ./ prefix, so check both
        const entry = entries.find(
          (e) => e.filename === fileName || e.filename === `./${fileName}`,
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
        `Unsupported SMB operation: '${(operation as SMBOperation).operation}'. ` +
          `Supported operations are: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
  }
}

export async function callSMB({
  endpoint,
  stepInputData,
  credentials,
  options,
  metadata,
}: {
  endpoint: RequestStepConfig;
  stepInputData?: Record<string, any>;
  credentials: Record<string, any>;
  options: RequestOptions;
  metadata: ServiceMetadata;
}): Promise<any> {
  const allVars = { ...stepInputData, ...credentials };

  const connectionString = await replaceVariables(endpoint.url || "", allVars);
  const connectionInfo = parseSMBConnectionUrl(connectionString);

  let operations: SMBOperation[] = [];
  try {
    const resolvedBody = await replaceVariables(endpoint.body, allVars);
    const body = parseJSON(resolvedBody);
    if (!Array.isArray(body)) {
      operations.push(body);
    } else {
      operations = body;
    }
  } catch (error) {
    throw new Error(
      `Invalid JSON in body: ${error.message}. Body must be valid JSON. Supported operations: ${SUPPORTED_OPERATIONS.join(", ")}`,
    );
  }

  // Validate operations
  if (operations.length === 0) {
    throw new Error(
      `No operations provided. Body must contain at least one operation. Supported operations: ${SUPPORTED_OPERATIONS.join(", ")}`,
    );
  }

  for (const operation of operations) {
    if (!operation.operation) {
      throw new Error(
        `Missing 'operation' field in request body. Supported operations are: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
    }
    if (!SUPPORTED_OPERATIONS.includes(operation.operation)) {
      throw new Error(
        `Unsupported operation: '${operation.operation}'. Supported operations are: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
    }
  }

  let attempts = 0;
  let results: any[] = [];
  const maxRetries = options?.retries || server_defaults.SMB.DEFAULT_RETRIES;
  const timeout = options?.timeout || server_defaults.SMB.DEFAULT_TIMEOUT;

  while (attempts <= maxRetries) {
    let client: SMBClient | null = null;
    let session: SMBSession | null = null;
    let tree: SMBTree | null = null;

    try {
      // Wrap entire connection and operation in timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`SMB operation timed out after ${timeout}ms`)), timeout);
      });

      const operationPromise = (async () => {
        // Create SMB client and connect
        client = new smb2.Client(connectionInfo.host, { port: connectionInfo.port });

        // Authenticate
        session = await client.authenticate({
          domain: connectionInfo.domain || credentials.domain || "",
          username: connectionInfo.username || credentials.username,
          password: connectionInfo.password || credentials.password,
        });

        // Connect to share
        tree = await session.connectTree(connectionInfo.share);

        // Execute operations
        const opResults: any[] = [];
        for (const operation of operations) {
          logMessage("debug", `Executing SMB operation: ${operation.operation}`, metadata);
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
        if (error instanceof Error) {
          const errorContext = ` for operations: ${JSON.stringify(operations)}`;
          throw new Error(`SMB error: ${error.message}${errorContext}`);
        }
        throw new Error("Unknown SMB error occurred");
      }

      const retryDelay = options?.retryDelay || server_defaults.SMB.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    } finally {
      // Clean up connections
      try {
        if (tree) await tree.disconnect();
        if (session) await session.logoff();
        if (client) await client.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return results.length === 1 ? results[0] : results;
}

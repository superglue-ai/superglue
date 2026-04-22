/**
 * FTP/SFTP Strategy for Deno runtime
 *
 * Uses npm:ssh2-sftp-client for SFTP and the pinned basic-ftp import-map entry for FTP/FTPS.
 */

import SFTPClient from "npm:ssh2-sftp-client";
import { Client as FTPClient } from "basic-ftp";
import { Readable, Writable } from "node:stream";
import { Buffer } from "node:buffer";
import * as path from "node:path";
import type {
  RequestStepConfig,
  RequestOptions,
  RawFileBytes,
  RuntimeExecutionFile,
  RuntimeFilePointer,
  ServiceMetadata,
  StepExecutionResult,
} from "../types.ts";
import { DENO_DEFAULTS } from "../types.ts";
import { replaceVariables } from "../utils/transform.ts";
import {
  buildRuntimeFile,
  contentToBuffer,
  guessContentType,
  parseJSON,
  resolveFileTokens,
} from "../utils/files.ts";
import { debug } from "../utils/logging.ts";

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

interface FTPOperation {
  operation: "list" | "get" | "put" | "delete" | "rename" | "mkdir" | "rmdir" | "exists" | "stat";
  path?: string;
  content?: string | Uint8Array | RawFileBytes | RuntimeFilePointer;
  newPath?: string;
  recursive?: boolean;
}

interface FtpOperationResult {
  data: unknown;
  producedFiles?: Record<string, RuntimeExecutionFile>;
}

function getProducedFileKey(filePath: string): string {
  return filePath;
}

/**
 * Execute an FTP/SFTP step
 */
export async function executeFtpStep(
  config: RequestStepConfig,
  payload: Record<string, unknown>,
  fileLookup: Record<string, RuntimeExecutionFile>,
  credentials: Record<string, unknown>,
  options: RequestOptions,
  metadata: ServiceMetadata,
  stepId?: string,
): Promise<StepExecutionResult> {
  try {
    const result = await callFTP({
      endpoint: config,
      stepInputData: payload,
      fileLookup,
      credentials,
      options,
      metadata,
      stepId,
    });
    return { success: true, data: result.data, producedFiles: result.producedFiles };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Parse connection URL
 */
function parseConnectionUrl(urlString: string): {
  protocol: "ftp" | "ftps" | "sftp";
  host: string;
  port: number;
  username?: string;
  password?: string;
  basePath?: string;
} {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch (error) {
    const protocolMatch = urlString.match(/^(sftp|ftps?):\/\//);
    if (!protocolMatch) {
      throw new Error("Invalid URL: protocol must be ftp, ftps, or sftp");
    }

    const afterProtocol = urlString.slice(protocolMatch[0].length);
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

  const protocol = url.protocol.replace(":", "") as "ftp" | "ftps" | "sftp";
  const defaultPorts = { ftp: 21, ftps: 21, sftp: 22 };

  const safeDecodeURIComponent = (str: string): string => {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  };

  return {
    protocol,
    host: url.hostname,
    port: url.port ? parseInt(url.port) : defaultPorts[protocol],
    username: url.username ? safeDecodeURIComponent(url.username) : undefined,
    password: url.password ? safeDecodeURIComponent(url.password) : undefined,
    basePath: url.pathname && url.pathname !== "/" ? url.pathname : undefined,
  };
}

/**
 * Resolve operation paths with base path
 */
function resolveOperationPaths(operations: FTPOperation[], basePath?: string): FTPOperation[] {
  if (!basePath) return operations;
  const resolve = (p: string) =>
    p.startsWith(basePath + "/") || p === basePath ? p : `${basePath}/${p.replace(/^\//, "")}`;
  return operations.map((op) => ({
    ...op,
    path: op.path ? resolve(op.path) : op.operation === "list" ? basePath : op.path,
    ...(op.newPath ? { newPath: resolve(op.newPath) } : {}),
  }));
}

/**
 * Execute SFTP operation
 */
async function executeSFTPOperation(
  client: SFTPClient,
  operation: FTPOperation,
  fileLookup: Record<string, RuntimeExecutionFile>,
): Promise<FtpOperationResult> {
  switch (operation.operation) {
    case "list": {
      const listPath = operation.path || "/";
      const files = await client.list(listPath);
      return {
        data: files.map(
          (file: {
            name: string;
            size: number;
            type: string;
            modifyTime: number;
            accessTime: number;
            rights?: { user: string; group: string; other: string };
            owner: number;
            group: number;
          }) => ({
            name: file.name,
            path: listPath + (listPath.endsWith("/") ? "" : "/") + file.name,
            size: file.size,
            type:
              file.type === "d"
                ? "directory"
                : file.type === "-"
                  ? "file"
                  : file.type === "l"
                    ? "symlink"
                    : "unknown",
            modifyTime: new Date(file.modifyTime).toISOString(),
            accessTime: new Date(file.accessTime).toISOString(),
            permissions: file.rights
              ? { user: file.rights.user, group: file.rights.group, other: file.rights.other }
              : null,
            owner: file.owner,
            group: file.group,
          }),
        ),
      };
    }

    case "get": {
      if (!operation.path) throw new Error("path required for get operation");
      const buffer = (await client.get(operation.path)) as Buffer;
      const file = await buildRuntimeFile(
        new Uint8Array(buffer),
        path.basename(operation.path),
        guessContentType(operation.path),
      );
      return {
        data: file.extracted,
        producedFiles: {
          [getProducedFileKey(operation.path)]: file,
        },
      };
    }

    case "put": {
      if (!operation.path) throw new Error("path required for put operation");
      if (operation.content === undefined || operation.content === null) {
        throw new Error("content required for put operation");
      }
      const buffer = contentToBuffer(operation.content, fileLookup);
      await client.put(Buffer.from(buffer), operation.path);
      return {
        data: {
          success: true,
          message: `Uploaded content to ${operation.path}`,
          size: buffer.length,
        },
      };
    }

    case "delete": {
      if (!operation.path) throw new Error("path required for delete operation");
      await client.delete(operation.path);
      return { data: { success: true, message: `Deleted ${operation.path}` } };
    }

    case "rename": {
      if (!operation.path || !operation.newPath) {
        throw new Error("Both path and newPath required for rename operation");
      }
      await client.rename(operation.path, operation.newPath);
      return {
        data: { success: true, message: `Renamed ${operation.path} to ${operation.newPath}` },
      };
    }

    case "mkdir": {
      if (!operation.path) throw new Error("path required for mkdir operation");
      await client.mkdir(operation.path, operation.recursive);
      return { data: { success: true, message: `Created directory ${operation.path}` } };
    }

    case "rmdir": {
      if (!operation.path) throw new Error("path required for rmdir operation");
      await client.rmdir(operation.path);
      return { data: { success: true, message: `Removed directory ${operation.path}` } };
    }

    case "exists": {
      if (!operation.path) throw new Error("path required for exists operation");
      const existsResult = await client.exists(operation.path);
      // ssh2-sftp-client returns "d"/"-"/"l" for different file types, or false if doesn't exist
      return { data: { exists: existsResult !== false, path: operation.path } };
    }

    case "stat": {
      if (!operation.path) throw new Error("path required for stat operation");
      try {
        const stats = await client.stat(operation.path);
        return {
          data: {
            exists: true,
            path: operation.path,
            size: stats.size,
            type: stats.isDirectory ? "directory" : stats.isFile ? "file" : "unknown",
            modifyTime: new Date(stats.modifyTime).toISOString(),
            accessTime: new Date(stats.accessTime).toISOString(),
            mode: stats.mode,
            uid: stats.uid,
            gid: stats.gid,
          },
        };
      } catch {
        return { data: { exists: false, path: operation.path } };
      }
    }

    default:
      throw new Error(
        `Unsupported SFTP operation: '${operation.operation}'. Supported: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
  }
}

/**
 * Execute FTP operation
 */
async function executeFTPOperation(
  client: FTPClient,
  operation: FTPOperation,
  fileLookup: Record<string, RuntimeExecutionFile>,
): Promise<FtpOperationResult> {
  switch (operation.operation) {
    case "list": {
      const listPath = operation.path || "/";
      const files = await client.list(listPath);
      return {
        data: files.map((file) => ({
          name: file.name,
          path: listPath + (listPath.endsWith("/") ? "" : "/") + file.name,
          size: file.size,
          type: file.isDirectory
            ? "directory"
            : file.isFile
              ? "file"
              : file.isSymbolicLink
                ? "symlink"
                : "unknown",
          modifyTime: file.modifiedAt?.toISOString() || null,
          permissions: file.permissions || null,
        })),
      };
    }

    case "get": {
      if (!operation.path) throw new Error("path required for get operation");
      const chunks: Uint8Array[] = [];
      const writeStream = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(new Uint8Array(chunk));
          callback();
        },
      });
      await client.downloadTo(writeStream, operation.path);
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const content = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        content.set(chunk, offset);
        offset += chunk.length;
      }
      const file = await buildRuntimeFile(
        content,
        path.basename(operation.path),
        guessContentType(operation.path),
      );
      return {
        data: file.extracted,
        producedFiles: {
          [getProducedFileKey(operation.path)]: file,
        },
      };
    }

    case "put": {
      if (!operation.path) throw new Error("path required for put operation");
      if (operation.content === undefined || operation.content === null) {
        throw new Error("content required for put operation");
      }
      const buffer = contentToBuffer(operation.content, fileLookup);
      const stream = Readable.from(Buffer.from(buffer));
      await client.uploadFrom(stream, operation.path);
      return {
        data: {
          success: true,
          message: `Uploaded content to ${operation.path}`,
          size: buffer.length,
        },
      };
    }

    case "delete": {
      if (!operation.path) throw new Error("path required for delete operation");
      await client.remove(operation.path);
      return { data: { success: true, message: `Deleted ${operation.path}` } };
    }

    case "rename": {
      if (!operation.path || !operation.newPath) {
        throw new Error("Both path and newPath required for rename operation");
      }
      await client.rename(operation.path, operation.newPath);
      return {
        data: { success: true, message: `Renamed ${operation.path} to ${operation.newPath}` },
      };
    }

    case "mkdir": {
      if (!operation.path) throw new Error("path required for mkdir operation");
      await client.ensureDir(operation.path);
      return { data: { success: true, message: `Created directory ${operation.path}` } };
    }

    case "rmdir": {
      if (!operation.path) throw new Error("path required for rmdir operation");
      await client.removeDir(operation.path);
      return { data: { success: true, message: `Removed directory ${operation.path}` } };
    }

    case "exists": {
      if (!operation.path) throw new Error("path required for exists operation");
      const dirPath = path.dirname(operation.path);
      const fileName = path.basename(operation.path);
      const dirList = await client.list(dirPath);
      const exists = dirList.some((item) => item.name === fileName);
      return { data: { exists, path: operation.path } };
    }

    case "stat": {
      if (!operation.path) throw new Error("path required for stat operation");
      const dirPath = path.dirname(operation.path);
      const fileName = path.basename(operation.path);
      const dirList = await client.list(dirPath);
      const file = dirList.find((item) => item.name === fileName);

      if (!file) {
        return { data: { exists: false, path: operation.path } };
      }

      return {
        data: {
          exists: true,
          path: operation.path,
          name: file.name,
          size: file.size,
          type: file.isDirectory ? "directory" : file.isFile ? "file" : "unknown",
          modifyTime: file.modifiedAt?.toISOString() || null,
          permissions: file.permissions || null,
        },
      };
    }

    default:
      throw new Error(
        `Unsupported FTP operation: '${operation.operation}'. Supported: ${SUPPORTED_OPERATIONS.join(", ")}`,
      );
  }
}

/**
 * Main FTP/SFTP call function
 */
async function callFTP({
  endpoint,
  stepInputData,
  fileLookup,
  credentials,
  options,
  metadata,
  stepId,
}: {
  endpoint: RequestStepConfig;
  stepInputData?: Record<string, unknown>;
  fileLookup: Record<string, RuntimeExecutionFile>;
  credentials: Record<string, unknown>;
  options: RequestOptions;
  metadata: ServiceMetadata;
  stepId?: string;
}): Promise<{ data: unknown; producedFiles: Record<string, RuntimeExecutionFile> }> {
  const allVars = { ...stepInputData, ...credentials };

  const connectionString = await replaceVariables(endpoint.url || "", allVars, metadata);
  const connectionInfo = parseConnectionUrl(connectionString);

  let operations: FTPOperation[] = [];
  try {
    const resolvedBody = await replaceVariables(endpoint.body || "", allVars, metadata);
    const body = resolveFileTokens(parseJSON(resolvedBody), fileLookup, { stepId });
    if (!Array.isArray(body)) {
      operations.push(body as FTPOperation);
    } else {
      operations = body as FTPOperation[];
    }
  } catch (error) {
    throw new Error(
      `Invalid JSON in body: ${(error as Error).message}. Supported operations: ${SUPPORTED_OPERATIONS.join(", ")}`,
    );
  }

  // Validate operations
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
  let producedFiles: Record<string, RuntimeExecutionFile> = {};
  const maxRetries = options?.retries || DENO_DEFAULTS.FTP.DEFAULT_RETRIES;
  const timeout = options?.timeout || DENO_DEFAULTS.FTP.DEFAULT_TIMEOUT;

  while (attempts <= maxRetries) {
    try {
      const attemptResults: unknown[] = [];
      const attemptProducedFiles: Record<string, RuntimeExecutionFile> = {};

      if (connectionInfo.protocol === "sftp") {
        const sftp = new SFTPClient();
        try {
          await sftp.connect({
            host: connectionInfo.host,
            port: connectionInfo.port,
            username: connectionInfo.username || (credentials.username as string),
            password: connectionInfo.password || (credentials.password as string),
            privateKey: credentials.privateKey as string,
            passphrase: credentials.passphrase as string,
            readyTimeout: timeout,
            retries: 1,
            retry_minTimeout: 1000,
            timeout: timeout,
          });

          const resolvedOps = resolveOperationPaths(operations, connectionInfo.basePath);
          for (const operation of resolvedOps) {
            debug(`Executing SFTP operation: ${operation.operation}`, metadata);
            const result = await executeSFTPOperation(sftp, operation, fileLookup);
            attemptResults.push(result.data);
            if (result.producedFiles) {
              Object.assign(attemptProducedFiles, result.producedFiles);
            }
          }
        } finally {
          await sftp.end();
        }
      } else {
        const ftp = new FTPClient(timeout);
        ftp.ftp.verbose = false;

        try {
          await ftp.access({
            host: connectionInfo.host,
            port: connectionInfo.port,
            user: connectionInfo.username || (credentials.username as string),
            password: connectionInfo.password || (credentials.password as string),
            secure: connectionInfo.protocol === "ftps",
            secureOptions:
              connectionInfo.protocol === "ftps" ? { rejectUnauthorized: false } : undefined,
          });

          const resolvedOps = resolveOperationPaths(operations, connectionInfo.basePath);
          for (const operation of resolvedOps) {
            debug(`Executing FTP operation: ${operation.operation}`, metadata);
            const result = await executeFTPOperation(ftp, operation, fileLookup);
            attemptResults.push(result.data);
            if (result.producedFiles) {
              Object.assign(attemptProducedFiles, result.producedFiles);
            }
          }
        } finally {
          ftp.close();
        }
      }

      results = attemptResults;
      producedFiles = attemptProducedFiles;
      break;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        const errorContext = ` for operations: ${JSON.stringify(operations)}`;
        throw new Error(
          `${connectionInfo.protocol.toUpperCase()} error: ${(error as Error).message}${errorContext}`,
        );
      }

      const retryDelay = options?.retryDelay || DENO_DEFAULTS.FTP.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return {
    data: results.length === 1 ? results[0] : results,
    producedFiles,
  };
}

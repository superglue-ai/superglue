import { ApiConfig as StepConfig, HttpMethod, RequestOptions } from "@superglue/client";
import { SupportedFileType } from "@superglue/shared";
import { Client as FTPClient } from "basic-ftp";
import * as path from "path";
import SFTPClient from "ssh2-sftp-client";
import { URL } from "url";
import { server_defaults } from "../../../default.js";
import { parseFile, parseJSON } from "../../../files/index.js";
import { composeUrl } from "../../../utils/helpers.js";
import { StepExecutionInput, StepStrategyExecutionResult, StepExecutionStrategy } from "../strategy.js";

export class FTPStepExecutionStrategy implements StepExecutionStrategy {
  readonly version = '1.0.0';

  async shouldExecute(stepConfig: StepConfig): Promise<boolean> {
    return stepConfig.method === HttpMethod.POST && stepConfig.urlHost?.startsWith("ftp://") || stepConfig.urlHost?.startsWith("ftps://") || stepConfig.urlHost?.startsWith("sftp://");
  }

  async executeStep(input: StepExecutionInput): Promise<StepStrategyExecutionResult> {
    const { stepConfig, stepInputData, credentials, requestOptions } = input;
    const result = await callFTP({ endpoint: stepConfig, credentials, options: requestOptions });
    return {
      success: true,
      strategyExecutionData: result,
    };
  }
}

const SUPPORTED_OPERATIONS = ['list', 'get', 'put', 'delete', 'rename', 'mkdir', 'rmdir', 'exists', 'stat'];

interface FTPOperation {
  operation: 'list' | 'get' | 'put' | 'delete' | 'rename' | 'mkdir' | 'rmdir' | 'exists' | 'stat';
  path?: string;
  content?: string | Buffer;
  newPath?: string;
  recursive?: boolean;
}

function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

export function parseConnectionUrl(urlString: string): {
  protocol: 'ftp' | 'ftps' | 'sftp';
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
      throw new Error('Invalid URL: protocol must be ftp, ftps, or sftp');
    }
    
    const afterProtocol = urlString.slice(protocolMatch[0].length);
    const lastAtIndex = afterProtocol.lastIndexOf('@');
    
    if (lastAtIndex === -1) {
      throw new Error(`Invalid URL format: ${error.message}`);
    }
    
    const credentials = afterProtocol.slice(0, lastAtIndex);
    const hostAndPath = afterProtocol.slice(lastAtIndex + 1);
    const colonIndex = credentials.indexOf(':');
    
    const username = colonIndex !== -1 
      ? encodeURIComponent(credentials.slice(0, colonIndex))
      : encodeURIComponent(credentials);
    const password = colonIndex !== -1 
      ? encodeURIComponent(credentials.slice(colonIndex + 1))
      : undefined;
    
    const encodedUrl = password 
      ? `${protocolMatch[0]}${username}:${password}@${hostAndPath}`
      : `${protocolMatch[0]}${username}@${hostAndPath}`;
    
    url = new URL(encodedUrl);
  }
  
  const protocol = url.protocol.replace(':', '') as 'ftp' | 'ftps' | 'sftp';
  const defaultPorts = {
    ftp: 21,
    ftps: 21,
    sftp: 22
  };

  return {
    protocol,
    host: url.hostname,
    port: url.port ? parseInt(url.port) : defaultPorts[protocol],
    username: url.username ? safeDecodeURIComponent(url.username) : undefined,
    password: url.password ? safeDecodeURIComponent(url.password) : undefined,
    basePath: url.pathname && url.pathname !== '/' ? url.pathname : undefined
  };
}

async function executeFTPOperation(client: FTPClient, operation: FTPOperation): Promise<any> {
  switch (operation.operation) {
    case 'list': {
      const files = await client.list(operation.path || '/');
      // Return as JSON-friendly format
      return files.map(file => ({
        name: file.name,
        path: operation.path + (operation.path?.endsWith("/") ? "" : "/") + file.name,
        size: file.size,
        type: file.isDirectory ? 'directory' : file.isFile ? 'file' : file.isSymbolicLink ? 'symlink' : 'unknown',
        modifyTime: file.modifiedAt?.toISOString() || null,
        permissions: file.permissions || null
      }));
    }

    case 'get': {
      if (!operation.path) throw new Error('path required for get operation');
      // Download to memory and return as string
      const { Writable } = await import('stream');
      const chunks: Buffer[] = [];
      const writeStream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });
      await client.downloadTo(writeStream, operation.path);
      const content = Buffer.concat(chunks);

      try {
        return await parseFile(content, SupportedFileType.AUTO);
      } catch {
        return content.toString('utf8');
      }
    }

    case 'put': {
      if (!operation.path) throw new Error('path required for put operation');
      if (!operation.content) throw new Error('content required for put operation');

      const { Readable } = await import('stream');
      const buffer = Buffer.isBuffer(operation.content) ? operation.content : Buffer.from(operation.content);
      const stream = Readable.from(buffer);
      await client.uploadFrom(stream, operation.path);

      return {
        success: true,
        message: `Uploaded content to ${operation.path}`,
        size: buffer.length
      };
    }

    case 'delete': {
      if (!operation.path) throw new Error('path required for delete operation');
      await client.remove(operation.path);
      return { success: true, message: `Deleted ${operation.path}` };
    }

    case 'rename': {
      if (!operation.path || !operation.newPath) {
        throw new Error('Both path and newPath required for rename operation');
      }
      await client.rename(operation.path, operation.newPath);
      return { success: true, message: `Renamed ${operation.path} to ${operation.newPath}` };
    }

    case 'mkdir': {
      if (!operation.path) throw new Error('path required for mkdir operation');
      await client.ensureDir(operation.path);
      return { success: true, message: `Created directory ${operation.path}` };
    }

    case 'rmdir': {
      if (!operation.path) throw new Error('path required for rmdir operation');
      await client.removeDir(operation.path);
      return { success: true, message: `Removed directory ${operation.path}` };
    }

    case 'exists': {
      if (!operation.path) throw new Error('path required for exists operation');
      const dirPath = path.dirname(operation.path);
      const fileName = path.basename(operation.path);
      const dirList = await client.list(dirPath);
      const exists = dirList.some(item => item.name === fileName);
      return { exists, path: operation.path };
    }

    case 'stat': {
      if (!operation.path) throw new Error('path required for stat operation');
      const dirPath = path.dirname(operation.path);
      const fileName = path.basename(operation.path);
      const dirList = await client.list(dirPath);
      const file = dirList.find(item => item.name === fileName);

      if (!file) {
        return { exists: false, path: operation.path };
      }

      return {
        exists: true,
        path: operation.path,
        name: file.name,
        size: file.size,
        type: file.isDirectory ? 'directory' : file.isFile ? 'file' : 'unknown',
        modifyTime: file.modifiedAt?.toISOString() || null,
        permissions: file.permissions || null
      };
    }

    default:
      throw new Error(
        `Unsupported FTP operation: '${operation.operation}'. ` +
        `Supported operations are: ${SUPPORTED_OPERATIONS.join(', ')}`
      );
  }
}

async function executeSFTPOperation(client: SFTPClient, operation: FTPOperation): Promise<any> {
  switch (operation.operation) {
    case 'list': {
      const files = await client.list(operation.path || '/');
      // Return as JSON-friendly format
      return files.map(file => ({
        name: file.name,
        path: operation.path + (operation.path?.endsWith("/") ? "" : "/") + file.name,
        size: file.size,
        type: file.type === 'd' ? 'directory' : file.type === '-' ? 'file' : file.type === 'l' ? 'symlink' : 'unknown',
        modifyTime: new Date(file.modifyTime).toISOString(),
        accessTime: new Date(file.accessTime).toISOString(),
        permissions: file.rights ? {
          user: file.rights.user,
          group: file.rights.group,
          other: file.rights.other
        } : null,
        owner: file.owner,
        group: file.group
      }));
    }

    case 'get': {
      if (!operation.path) throw new Error('path required for get operation');
      const buffer = await client.get(operation.path) as Buffer;

      try {
        return await parseFile(buffer, SupportedFileType.AUTO);
      } catch {
        return buffer.toString('utf8');
      }
    }

    case 'put': {
      if (!operation.path) throw new Error('path required for put operation');
      if (!operation.content) throw new Error('content required for put operation');

      const buffer = Buffer.isBuffer(operation.content) ? operation.content : Buffer.from(operation.content);
      await client.put(buffer, operation.path);

      return {
        success: true,
        message: `Uploaded content to ${operation.path}`,
        size: buffer.length
      };
    }

    case 'delete': {
      if (!operation.path) throw new Error('path required for delete operation');
      await client.delete(operation.path);
      return { success: true, message: `Deleted ${operation.path}` };
    }

    case 'rename': {
      if (!operation.path || !operation.newPath) {
        throw new Error('Both path and newPath required for rename operation');
      }
      await client.rename(operation.path, operation.newPath);
      return { success: true, message: `Renamed ${operation.path} to ${operation.newPath}` };
    }

    case 'mkdir': {
      if (!operation.path) throw new Error('path required for mkdir operation');
      await client.mkdir(operation.path, operation.recursive);
      return { success: true, message: `Created directory ${operation.path}` };
    }

    case 'rmdir': {
      if (!operation.path) throw new Error('path required for rmdir operation');
      await client.rmdir(operation.path);
      return { success: true, message: `Removed directory ${operation.path}` };
    }

    case 'exists': {
      if (!operation.path) throw new Error('path required for exists operation');
      const exists = await client.exists(operation.path);
      return { exists, path: operation.path };
    }

    case 'stat': {
      if (!operation.path) throw new Error('path required for stat operation');
      try {
        const stats = await client.stat(operation.path);
        return {
          exists: true,
          path: operation.path,
          size: stats.size,
          type: stats.isDirectory ? 'directory' : stats.isFile ? 'file' : 'unknown',
          modifyTime: new Date(stats.modifyTime).toISOString(),
          accessTime: new Date(stats.accessTime).toISOString(),
          mode: stats.mode,
          uid: stats.uid,
          gid: stats.gid
        };
      } catch (error) {
        return { exists: false, path: operation.path };
      }
    }

    default:
      throw new Error(
        `Unsupported SFTP operation: '${operation.operation}'. ` +
        `Supported operations are: ${SUPPORTED_OPERATIONS.join(', ')}`
      );
  }
}

export async function callFTP({ endpoint, credentials, options }: { endpoint: StepConfig, credentials: Record<string, any>, options: RequestOptions }): Promise<any> {
  let connectionString = composeUrl(endpoint.urlHost, endpoint.urlPath);
  const connectionInfo = parseConnectionUrl(connectionString);
  let operations: FTPOperation[] = [];
  try {
    const body = parseJSON(endpoint.body);
    if(!Array.isArray(body)) {
      operations.push(body);
    } else {
      operations = body;
    }
  } catch (error) {
    throw new Error(`Invalid JSON in body: ${error.message}. Body must be a JSON object with an 'operation' field. Supported operations: ${SUPPORTED_OPERATIONS.join(', ')}`);
  }

  // Validate operation
  for(const operation of operations) {
    if (!operation.operation) {
      throw new Error(`Missing 'operation' field in request body. Supported operations are: ${SUPPORTED_OPERATIONS.join(', ')}`);
    }
    if (!SUPPORTED_OPERATIONS.includes(operation.operation as 'list' | 'get' | 'put' | 'delete' | 'rename' | 'mkdir' | 'rmdir' | 'exists' | 'stat')) {
      throw new Error(`Unsupported operation: '${operation.operation}'. Supported operations are: ${SUPPORTED_OPERATIONS.join(', ')}`);
    }
  }

  let attempts = 0;
  let results: any[] = [];
  const maxRetries = options?.retries || server_defaults.FTP.DEFAULT_RETRIES;
  const timeout = options?.timeout || server_defaults.FTP.DEFAULT_TIMEOUT;

  while (attempts <= maxRetries) {
    try {
      if (connectionInfo.protocol === 'sftp') {
        // SFTP Connection
        const sftp = new SFTPClient();
        try {
          await sftp.connect({
            host: connectionInfo.host,
            port: connectionInfo.port,
            username: connectionInfo.username || credentials.username,
            password: connectionInfo.password || credentials.password,
            privateKey: credentials.privateKey,
            passphrase: credentials.passphrase,
            readyTimeout: timeout,
            retries: 1,
            retry_minTimeout: 1000,
            timeout: timeout
          });

          for(const operation of operations) {
            const result = await executeSFTPOperation(sftp, operation);
            results.push(result);
          }
        } finally {
          await sftp.end();
        }
      } else {
        // FTP/FTPS Connection
        const ftp = new FTPClient(timeout);
        ftp.ftp.verbose = false;

        try {
          await ftp.access({
            host: connectionInfo.host,
            port: connectionInfo.port,
            user: connectionInfo.username || credentials.username,
            password: connectionInfo.password || credentials.password,
            secure: connectionInfo.protocol === 'ftps',
            secureOptions: connectionInfo.protocol === 'ftps' ? {
              rejectUnauthorized: false
            } : undefined
          });

          // Change to base path if specified
          if (connectionInfo.basePath) {
            await ftp.cd(connectionInfo.basePath);
          }

          for(const operation of operations) {
            const result = await executeFTPOperation(ftp, operation);
            results.push(result);
          }
        } finally {
          ftp.close();
        }
      }
      
      break;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        if (error instanceof Error) {
          const errorContext = ` for operations: ${JSON.stringify(operations)}`;
          throw new Error(`${connectionInfo.protocol.toUpperCase()} error: ${error.message}${errorContext}`);
        }
        throw new Error(`Unknown ${connectionInfo.protocol.toUpperCase()} error occurred`);
      }

      const retryDelay = options?.retryDelay || server_defaults.FTP.DEFAULT_RETRY_DELAY;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  return results.length === 1 ? results[0] : results;
}


/**
 * Redis Strategy for Deno runtime
 *
 * Uses npm:ioredis for Redis connections.
 */

import { Redis } from "npm:ioredis";
import type {
  RequestStepConfig,
  RequestOptions,
  ServiceMetadata,
  StepExecutionResult,
} from "../types.ts";
import { DENO_DEFAULTS } from "../types.ts";
import { replaceVariables } from "../utils/transform.ts";
import { parseJSON } from "../utils/files.ts";
import { debug } from "../utils/logging.ts";

/**
 * Execute a Redis step
 */
export async function executeRedisStep(
  config: RequestStepConfig,
  payload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  options: RequestOptions,
  metadata: ServiceMetadata,
): Promise<StepExecutionResult> {
  try {
    const result = await callRedis({
      endpoint: config,
      payload,
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
 * Create a Redis client
 */
function createClient(connectionString: string): Redis {
  const useTls = connectionString.startsWith("rediss://");
  return new Redis(connectionString, {
    commandTimeout: DENO_DEFAULTS.REDIS.DEFAULT_TIMEOUT,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    ...(useTls ? { tls: {} } : {}),
  });
}

/**
 * Main Redis call function
 */
async function callRedis({
  endpoint,
  payload,
  credentials,
  options,
  metadata,
}: {
  endpoint: RequestStepConfig;
  payload: Record<string, unknown>;
  credentials: Record<string, unknown>;
  options: RequestOptions;
  metadata: ServiceMetadata;
}): Promise<unknown> {
  const requestVars = { ...payload, ...credentials };
  let connectionString = await replaceVariables(endpoint.url, requestVars, metadata);
  connectionString = connectionString.replace(/\/+$/, "");

  let bodyParsed:
    | { command: string; args?: unknown[] }
    | Array<{ command: string; args?: unknown[] }>;
  try {
    const resolvedBody = await replaceVariables(endpoint.body || "", requestVars, metadata);
    bodyParsed = parseJSON(resolvedBody) as typeof bodyParsed;
  } catch (error) {
    throw new Error(
      `Invalid JSON in body: ${(error as Error).message} for body: ${JSON.stringify(endpoint.body)}`,
    );
  }

  // Accept single command object or array of commands
  let commands: Array<{ command: string; args?: unknown[] }> = [];
  if (Array.isArray(bodyParsed)) {
    commands = bodyParsed;
  } else {
    commands.push(bodyParsed);
  }

  for (const cmd of commands) {
    if (!cmd.command || typeof cmd.command !== "string") {
      throw new Error(
        "Each Redis command must have a 'command' string (e.g. GET, HGETALL, LRANGE)",
      );
    }
  }

  const client = createClient(connectionString);
  const maxRetries = options?.retries || DENO_DEFAULTS.REDIS.DEFAULT_RETRIES;

  try {
    await client.connect();

    if (commands.length === 1) {
      return await executeSingleCommand({
        client,
        command: commands[0].command,
        args: commands[0].args || [],
        maxRetries,
        options,
        metadata,
      });
    }

    return await executePipeline({ client, commands, maxRetries, options, metadata });
  } finally {
    client.disconnect();
  }
}

/**
 * Execute a single Redis command
 */
async function executeSingleCommand({
  client,
  command,
  args,
  maxRetries,
  options,
  metadata,
}: {
  client: Redis;
  command: string;
  args: unknown[];
  maxRetries: number;
  options: RequestOptions;
  metadata: ServiceMetadata;
}): Promise<unknown> {
  let attempts = 0;

  do {
    try {
      debug(`Executing Redis command: ${command}`, metadata);
      const result = await client.call(command, ...(args as string[]));
      return result;
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        throw new Error(
          `Redis error: ${(error as Error).message} for command: ${command} with args: ${JSON.stringify(args)}`,
        );
      }

      const retryDelay = options?.retryDelay || DENO_DEFAULTS.REDIS.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);

  throw new Error("Redis command failed after all retries");
}

/**
 * Execute a Redis pipeline
 */
async function executePipeline({
  client,
  commands,
  maxRetries,
  options,
  metadata,
}: {
  client: Redis;
  commands: Array<{ command: string; args?: unknown[] }>;
  maxRetries: number;
  options: RequestOptions;
  metadata: ServiceMetadata;
}): Promise<unknown> {
  let attempts = 0;

  do {
    try {
      debug(`Executing Redis pipeline: ${commands.length} commands`, metadata);
      const pipeline = client.pipeline();
      for (const cmd of commands) {
        pipeline.call(cmd.command, ...((cmd.args || []) as string[]));
      }
      const rawResults = await pipeline.exec();
      // pipeline.exec() returns [[error, result], ...] — unwrap
      return rawResults?.map(([err, result], i) => ({
        command: commands[i].command,
        ...(err ? { error: (err as Error).message } : { result }),
      }));
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        throw new Error(`Redis pipeline error: ${(error as Error).message}`);
      }

      const retryDelay = options?.retryDelay || DENO_DEFAULTS.REDIS.DEFAULT_RETRY_DELAY;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  } while (attempts <= maxRetries);

  throw new Error("Redis pipeline failed after all retries");
}

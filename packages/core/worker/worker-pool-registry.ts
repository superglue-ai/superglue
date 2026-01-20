import { resolve } from "path";
import { fileURLToPath } from "url";
import { WorkerPool } from "./worker-pool.js";
import { server_defaults } from "../default.js";
import { logMessage } from "../utils/logs.js";
import type { DataStore } from "../datastore/types.js";
import { CredentialUpdateMessage, WorkerPools } from "./types.js";
import { ToolExecutionPayload, ToolExecutionResult } from "./types.js";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export function initializeWorkerPools(datastore: DataStore): WorkerPools {
  const toolExecutionPool = initializeToolExecutionPool(datastore);
  const config = server_defaults.WORKER_POOLS.EXECUTE_TOOL_WORKER_POOL;

  logMessage(
    "info",
    `Worker pool initialized: toolExecution (threads: ${config.SIZE}, memory: ${config.MEMORY_MB}MB)`,
  );

  return { toolExecution: toolExecutionPool };
}

function initializeToolExecutionPool(
  datastore: DataStore,
): WorkerPool<ToolExecutionPayload, ToolExecutionResult> {
  const config = server_defaults.WORKER_POOLS.EXECUTE_TOOL_WORKER_POOL;

  return new WorkerPool<ToolExecutionPayload, ToolExecutionResult>(
    resolve(__dirname, "tasks/tool-execution-task.js"),
    {
      concurrency: config.SIZE,
      memoryMb: config.MEMORY_MB,
      messageHandlers: {
        credential_update: async (message: CredentialUpdateMessage) => {
          try {
            const current = await datastore.getSystem({
              id: message.systemId,
              orgId: message.orgId,
            });
            if (current) {
              current.credentials = message.credentials;
              await datastore.upsertSystem({
                id: message.systemId,
                system: current,
                orgId: message.orgId,
              });
              logMessage("info", `Credentials updated for system ${message.systemId}`, {
                orgId: message.orgId,
              });
            }
          } catch (error) {
            logMessage(
              "error",
              `Failed to update credentials for system ${message.systemId}: ${error}`,
              { orgId: message.orgId },
            );
          }
        },
      },
    },
  );
}

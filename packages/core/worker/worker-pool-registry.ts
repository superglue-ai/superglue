import { fileURLToPath } from "url";
import path from "path";
import { existsSync } from "fs";
import { server_defaults } from "../default.js";
import { logMessage } from "../utils/logs.js";
import type { DataStore } from "../datastore/types.js";
import { WorkerPools } from "./types.js";
import { DenoProcessPool } from "../deno/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Resolve deno-runtime path - works from both source and dist
function resolveDenoRuntimePath(): string {
  // From packages/core/worker/ -> packages/core/deno-runtime/
  // From packages/core/dist/worker/ -> packages/core/deno-runtime/
  const possiblePaths = [
    path.resolve(__dirname, "../deno-runtime/workflow-executor.ts"), // from source
    path.resolve(__dirname, "../../deno-runtime/workflow-executor.ts"), // from dist
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  throw new Error(
    `Could not find deno-runtime/workflow-executor.ts. Searched: ${possiblePaths.join(", ")}`,
  );
}

export function initializeWorkerPools(datastore: DataStore): WorkerPools {
  const denoPool = initializeDenoPool(datastore);
  const config = server_defaults.DENO;

  logMessage(
    "info",
    `Deno pool initialized: toolExecution (pool size: ${config.POOL_SIZE}, memory: ${config.MEMORY_MB}MB)`,
  );

  return { toolExecution: denoPool };
}

function initializeDenoPool(datastore: DataStore): DenoProcessPool {
  const config = server_defaults.DENO;
  const scriptPath = resolveDenoRuntimePath();

  logMessage("debug", `Deno runtime script path: ${scriptPath}`);

  const pool = new DenoProcessPool({
    poolSize: config.POOL_SIZE,
    memoryMb: config.MEMORY_MB,
    workflowTimeoutMs: config.WORKFLOW_TIMEOUT_MS,
    scriptPath,
    recycleAfterExecutions: config.RECYCLE_AFTER_EXECUTIONS,
  });

  // Set up credential update handler
  pool.setCredentialUpdateHandler(async (systemId, orgId, credentials) => {
    try {
      const current = await datastore.getSystem({ id: systemId, orgId });
      if (current) {
        current.credentials = credentials;
        await datastore.upsertSystem({ id: systemId, system: current, orgId });
        logMessage("info", `Credentials updated for system ${systemId}`, { orgId });
      }
    } catch (error) {
      logMessage("error", `Failed to update credentials for system ${systemId}: ${error}`, {
        orgId,
      });
    }
  });

  return pool;
}

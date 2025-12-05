import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { WorkerPool } from './worker-pool.js';
import { server_defaults } from '../default.js';
import { logMessage } from '../utils/logs.js';
import type { ToolExecutionPayload, ToolExecutionResult } from './tasks/toolExecutionTask.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export type WorkerPools = {
  toolExecution: WorkerPool<ToolExecutionPayload, ToolExecutionResult>;
};

export function initializeWorkerPools(): WorkerPools {
  const toolExecutionConfig = server_defaults.WORKER_POOLS.EXECUTE_TOOL_WORKER_POOL;
  
  const toolExecutionPool = new WorkerPool<ToolExecutionPayload, ToolExecutionResult>(
    resolve(__dirname, 'tasks/toolExecutionTask.js'),
    toolExecutionConfig.SIZE,
    toolExecutionConfig.MEMORY_MB
  );
  
  logMessage('info', `Worker pool initialized: toolExecution (threads: ${toolExecutionConfig.SIZE}, memory: ${toolExecutionConfig.MEMORY_MB}MB)`);

  return { toolExecution: toolExecutionPool };
}


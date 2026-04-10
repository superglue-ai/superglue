/**
 * Deno Process Pool - manages a pool of Deno subprocess workers
 *
 * Replaces Piscina for tool execution with Deno subprocesses.
 */

import { fileURLToPath } from "url";
import path from "path";
import { logMessage } from "../utils/logs.js";
import { DenoWorker } from "./deno-worker.js";
import type {
  DenoPoolConfig,
  DenoWorkflowPayload,
  DenoWorkflowResult,
  QueuedTask,
  CredentialUpdateHandler,
  LogHandler,
} from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Default configuration
const DEFAULT_CONFIG: DenoPoolConfig = {
  poolSize: 12,
  memoryMb: 8192,
  workflowTimeoutMs: 21_600_000, // 6 hours
  scriptPath: path.resolve(__dirname, "../../deno-runtime/workflow-executor.ts"),
  maxQueueSize: 100,
  recycleAfterExecutions: 100,
};

export class DenoProcessPool {
  private workers: DenoWorker[] = [];
  private queue: QueuedTask[] = [];
  private config: DenoPoolConfig;
  private controllers = new Map<string, AbortController>();
  private onCredentialUpdate?: CredentialUpdateHandler;
  private onLog?: LogHandler;
  private isShuttingDown = false;

  constructor(config?: Partial<DenoPoolConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set credential update handler
   */
  setCredentialUpdateHandler(handler: CredentialUpdateHandler): void {
    this.onCredentialUpdate = handler;
  }

  /**
   * Set log handler
   */
  setLogHandler(handler: LogHandler): void {
    this.onLog = handler;
  }

  /**
   * Run a workflow task
   */
  async runTask(
    taskId: string,
    payload: DenoWorkflowPayload & { runId: string },
  ): Promise<DenoWorkflowResult> {
    if (taskId !== payload.runId) {
      throw new Error(`taskId (${taskId}) must match payload.runId (${payload.runId})`);
    }

    if (this.isShuttingDown) {
      throw new Error("Pool is shutting down");
    }

    const controller = new AbortController();
    this.controllers.set(taskId, controller);

    try {
      // Try to get an available worker
      const worker = this.getAvailableWorker();

      if (worker) {
        return await this.executeOnWorker(worker, taskId, payload, controller.signal);
      }

      // No worker available, queue the task
      if (this.queue.length >= (this.config.maxQueueSize || 100)) {
        throw new Error("Queue is full, try again later");
      }

      return await this.queueTask(taskId, payload, controller.signal);
    } finally {
      this.controllers.delete(taskId);
    }
  }

  /**
   * Abort a running task
   */
  abortTask(taskId: string): void {
    const controller = this.controllers.get(taskId);
    if (controller) {
      controller.abort();
    }

    // Check if task is in queue
    const queueIndex = this.queue.findIndex((t) => t.taskId === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      clearTimeout(task.timeoutId);
      task.reject(new Error("Task aborted"));
    }

    // Check if task is running on a worker - only abort the specific worker
    for (const worker of this.workers) {
      if (worker.isBusy && worker.currentTaskId === taskId) {
        worker.abort();
        break;
      }
    }
  }

  /**
   * Get an available worker or create one if pool not full
   */
  private getAvailableWorker(): DenoWorker | null {
    // Find an idle worker
    for (const worker of this.workers) {
      if (!worker.isBusy) {
        // Check if worker needs recycling
        if (
          this.config.recycleAfterExecutions &&
          worker.executions >= this.config.recycleAfterExecutions
        ) {
          this.removeWorker(worker);
          continue;
        }
        return worker;
      }
    }

    // Create new worker if pool not full
    if (this.workers.length < this.config.poolSize) {
      const worker = this.createWorker();
      this.workers.push(worker);
      return worker;
    }

    return null;
  }

  /**
   * Create a new worker
   */
  private createWorker(): DenoWorker {
    return new DenoWorker({
      scriptPath: this.config.scriptPath,
      memoryMb: this.config.memoryMb,
      workflowTimeoutMs: this.config.workflowTimeoutMs,
      onCredentialUpdate: this.onCredentialUpdate,
      onLog: this.onLog,
    });
  }

  /**
   * Remove a worker from the pool
   */
  private removeWorker(worker: DenoWorker): void {
    const index = this.workers.indexOf(worker);
    if (index !== -1) {
      this.workers.splice(index, 1);
      worker.kill();
    }
  }

  /**
   * Execute task on a worker
   */
  private async executeOnWorker(
    worker: DenoWorker,
    taskId: string,
    payload: DenoWorkflowPayload,
    signal: AbortSignal,
  ): Promise<DenoWorkflowResult> {
    // Set up abort handler
    const abortHandler = () => {
      worker.abort();
    };
    signal.addEventListener("abort", abortHandler);

    try {
      const result = await worker.execute(taskId, payload);
      return result;
    } catch (error) {
      // On error, remove and replace the worker
      this.removeWorker(worker);

      throw error;
    } finally {
      signal.removeEventListener("abort", abortHandler);
      // Always process queue after execution (success or failure)
      this.processQueue();
    }
  }

  /**
   * Queue a task for later execution
   */
  private queueTask(
    taskId: string,
    payload: DenoWorkflowPayload,
    signal: AbortSignal,
  ): Promise<DenoWorkflowResult> {
    return new Promise((resolve, reject) => {
      // Set up timeout for queued task
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex((t) => t.taskId === taskId);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error("Task timed out while waiting in queue"));
        }
      }, this.config.workflowTimeoutMs);

      // Set up abort handler
      const abortHandler = () => {
        const index = this.queue.findIndex((t) => t.taskId === taskId);
        if (index !== -1) {
          this.queue.splice(index, 1);
          clearTimeout(timeoutId);
          reject(new Error("Task aborted"));
        }
      };
      signal.addEventListener("abort", abortHandler);

      this.queue.push({
        taskId,
        payload,
        resolve: (result) => {
          signal.removeEventListener("abort", abortHandler);
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          signal.removeEventListener("abort", abortHandler);
          clearTimeout(timeoutId);
          reject(error);
        },
        timeoutId,
      });

      logMessage("debug", `Task ${taskId} queued, queue size: ${this.queue.length}`);
    });
  }

  /**
   * Process the next task in the queue
   */
  private processQueue(): void {
    if (this.queue.length === 0) return;

    const worker = this.getAvailableWorker();
    if (!worker) return;

    const task = this.queue.shift();
    if (!task) return;

    clearTimeout(task.timeoutId);

    // Create a new abort controller for this execution
    const controller = new AbortController();
    this.controllers.set(task.taskId, controller);

    this.executeOnWorker(worker, task.taskId, task.payload, controller.signal)
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => {
        this.controllers.delete(task.taskId);
      });
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    busyWorkers: number;
    queueSize: number;
    totalExecutions: number;
  } {
    const busyWorkers = this.workers.filter((w) => w.isBusy).length;
    const totalExecutions = this.workers.reduce((sum, w) => sum + w.executions, 0);

    return {
      totalWorkers: this.workers.length,
      busyWorkers,
      queueSize: this.queue.length,
      totalExecutions,
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Reject all queued tasks
    for (const task of this.queue) {
      clearTimeout(task.timeoutId);
      task.reject(new Error("Pool is shutting down"));
    }
    this.queue = [];

    // Kill all workers
    for (const worker of this.workers) {
      worker.kill();
    }
    this.workers = [];

    logMessage("info", "Deno process pool shut down");
  }
}

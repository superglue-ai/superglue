import { Piscina } from "piscina";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { logEmitter, logger, logMessage } from "../utils/logs.js";
import { WorkerMessageHandler, WorkerPoolOptions } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export class WorkerPool<Payload, Result> {
  private pool: Piscina;
  private controllers = new Map<string, AbortController>();
  private pendingFlushes = new Map<string, () => void>();
  private messageHandlers: Record<string, WorkerMessageHandler>;

  constructor(taskModuleJsPath: string, options: WorkerPoolOptions) {
    const { concurrency = 1, memoryMb = 4096, messageHandlers = {} } = options;
    this.messageHandlers = messageHandlers;

    this.pool = new Piscina({
      filename: resolve(__dirname, "worker-host.js"), // path to the common worker entry file that handles task loading and execution
      minThreads: concurrency + 1, // active workers + warm spare
      maxThreads: concurrency + 1, // active workers + warm spare
      concurrentTasksPerWorker: 1, // ensures spare stays unused unless needed
      idleTimeout: 0, // we want long-lived workers that pre-load heavy dependencies
      maxQueue: "auto", // this is a feature in piscina that rejects tasks immediately if job throughput decreases and queue grows too quickly
      workerData: { taskModule: taskModuleJsPath }, // path to the JS task module that contains the actual task logic
      resourceLimits: {
        maxOldGenerationSizeMb: memoryMb, // max worker RAM budget, should depend on server resources (RAM and CPU cores)
      },
    });

    this.pool.on("message", (msg) => {
      if (!msg?.type) return;

      if (msg.type === "log" && msg.payload) {
        this.handleLog(msg.payload);
        return;
      }

      if (msg.type === "logs_flushed" && msg.runId) {
        this.resolvePendingFlush(msg.runId);
        return;
      }

      const handler = this.messageHandlers[msg.type];
      if (handler) {
        try {
          Promise.resolve(handler(msg.payload)).catch((err) => {
            logMessage(
              "error",
              `Worker message handler '${msg.type}' rejected: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        } catch (err) {
          logMessage(
            "error",
            `Worker message handler '${msg.type}' threw: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  }

  async runTask(taskId: string, payload: Payload & { runId: string }): Promise<Result> {
    if (taskId !== payload.runId) {
      throw new Error(`taskId (${taskId}) must match payload.runId (${payload.runId})`);
    }

    const controller = new AbortController();
    this.controllers.set(taskId, controller);

    try {
      const flushPromise = new Promise<void>((resolve) => {
        this.pendingFlushes.set(taskId, resolve);
      });

      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(resolve, 2000); // 2 seconds
      });

      const result = (await this.pool.run(payload, { signal: controller.signal })) as Result;
      await Promise.race([flushPromise, timeoutPromise]);
      return result;
    } finally {
      this.controllers.delete(taskId);
      this.pendingFlushes.delete(taskId);
    }
  }

  abortTask(taskId: string) {
    const controller = this.controllers.get(taskId);
    if (controller) {
      controller.abort();
      this.pendingFlushes.delete(taskId);
    }
  }

  private handleLog(log: any) {
    logEmitter.emit("log", log);

    const level = log.level.toLowerCase() as "info" | "error" | "warn" | "debug";
    const metadata = { traceId: log.traceId, orgId: log.orgId };
    logger[level](metadata, log.message);
  }

  private resolvePendingFlush(runId: string) {
    const resolve = this.pendingFlushes.get(runId);
    if (resolve) {
      resolve();
      this.pendingFlushes.delete(runId);
    }
  }
}

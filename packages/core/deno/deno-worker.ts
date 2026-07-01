/**
 * Deno Worker - manages a single Deno subprocess
 */

import { spawn, ChildProcess } from "child_process";
import { encode, decode } from "@msgpack/msgpack";
import { logMessage } from "../utils/logs.js";
import type {
  DenoWorkflowPayload,
  DenoWorkflowResult,
  DenoStderrMessage,
  CredentialUpdateHandler,
  LogHandler,
} from "./types.js";

export interface DenoWorkerOptions {
  scriptPath: string;
  memoryMb: number;
  workflowTimeoutMs: number;
  onCredentialUpdate?: CredentialUpdateHandler;
  onLog?: LogHandler;
}

export class DenoWorker {
  readonly id: string;
  private process: ChildProcess | null = null;
  private busy = false;
  private executionCount = 0;
  private lastUsed = Date.now();
  private _currentTaskId?: string;
  private aborted = false;
  private options: DenoWorkerOptions;

  constructor(options: DenoWorkerOptions) {
    this.id = crypto.randomUUID();
    this.options = options;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get executions(): number {
    return this.executionCount;
  }

  get lastUsedAt(): number {
    return this.lastUsed;
  }

  get currentTaskId(): string | undefined {
    return this._currentTaskId;
  }

  /**
   * Execute a workflow in this worker
   */
  async execute(taskId: string, payload: DenoWorkflowPayload): Promise<DenoWorkflowResult> {
    if (this.busy) {
      throw new Error(`Worker ${this.id} is busy`);
    }

    this.busy = true;
    this._currentTaskId = taskId;
    this.aborted = false;
    this.lastUsed = Date.now();

    const metadata = { traceId: payload.traceId, orgId: payload.orgId };

    try {
      this.process = spawn(
        "deno",
        [
          "run",
          "--allow-net",
          "--allow-env",
          "--allow-sys=hostname",
          "--deny-read",
          "--deny-write",
          "--deny-run",
          `--v8-flags=--max-old-space-size=${this.options.memoryMb}`,
          this.options.scriptPath,
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            DENO_DIR: process.env.DENO_DIR,
            DENO_NO_UPDATE_CHECK: "1",
            NODE_ENV: process.env.NODE_ENV,
          },
        },
      );

      // Set up stderr handler for logs and credential updates
      this.setupStderrHandler(payload.orgId, metadata);

      // Send payload via stdin (MessagePack encoded)
      const encoded = encode(payload);
      this.process.stdin!.write(Buffer.from(encoded));
      this.process.stdin!.end();

      // Set up timeout
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          this.kill();
          reject(new Error(`Workflow timed out after ${this.options.workflowTimeoutMs}ms`));
        }, this.options.workflowTimeoutMs);
      });

      // Collect stdout (result)
      const resultPromise = this.collectResult();

      try {
        // Wait for result or timeout
        const result = await Promise.race([resultPromise, timeoutPromise]);

        this.executionCount++;
        return result;
      } finally {
        // Clear timeout in all paths to prevent stale timers
        if (timeoutId) clearTimeout(timeoutId);
      }
    } catch (error) {
      logMessage(
        "error",
        `Deno worker ${this.id} execution failed: ${(error as Error).message}`,
        metadata,
      );
      throw error;
    } finally {
      this.busy = false;
      this._currentTaskId = undefined;
      this.cleanup();
    }
  }

  /**
   * Collect result from stdout
   */
  private async collectResult(): Promise<DenoWorkflowResult> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error("No process"));
        return;
      }

      const chunks: Buffer[] = [];

      this.process.stdout!.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      this.process.stdout!.on("end", () => {
        try {
          const combined = Buffer.concat(chunks);
          if (combined.length === 0) {
            if (this.aborted) {
              const err = new Error("Task aborted");
              err.name = "AbortError";
              reject(err);
              return;
            }
            reject(new Error("Empty response from Deno subprocess"));
            return;
          }
          const result = decode(combined) as DenoWorkflowResult;
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to decode result: ${(error as Error).message}`));
        }
      });

      this.process.stdout!.on("error", (error) => {
        reject(error);
      });

      this.process.on("error", (error) => {
        reject(error);
      });

      this.process.on("exit", (code) => {
        if (code !== 0 && chunks.length === 0) {
          if (this.aborted) {
            const err = new Error("Task aborted");
            err.name = "AbortError";
            reject(err);
            return;
          }
          reject(new Error(`Deno process exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Set up stderr handler for logs and credential updates
   */
  private setupStderrHandler(orgId: string, metadata: { traceId?: string; orgId?: string }): void {
    if (!this.process?.stderr) return;

    let buffer = "";

    this.process.stderr.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const msg = JSON.parse(line) as DenoStderrMessage;

          if (msg.type === "log") {
            // Forward log to handler or default logger
            if (this.options.onLog) {
              this.options.onLog(msg);
            } else {
              logMessage(msg.level, msg.message, metadata);
            }
          } else if (msg.type === "credential_update") {
            // Handle credential update
            if (this.options.onCredentialUpdate) {
              this.options.onCredentialUpdate(msg.systemId, orgId, msg.credentials).catch((err) => {
                logMessage("error", `Failed to update credentials: ${err.message}`, metadata);
              });
            }
          }
        } catch {
          // Non-JSON stderr (errors, warnings from Deno itself)
          logMessage("debug", `[Deno stderr] ${line}`, metadata);
        }
      }
    });
  }

  /**
   * Kill the process.
   *
   * Captures the process reference locally so the delayed SIGKILL can still
   * fire even after cleanup() sets this.process = null.
   *
   * Note: Node.js sets `proc.killed = true` immediately after any successful
   * kill() call (regardless of whether the process actually exited), so we
   * cannot use it to gate the SIGKILL. Instead we unconditionally attempt
   * SIGKILL and let the try-catch handle the already-exited case.
   */
  kill(): void {
    const proc = this.process;
    if (proc && !proc.killed) {
      proc.kill("SIGTERM");
      // Force kill after 5 seconds if process hasn't exited
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Process already exited — nothing to do
        }
      }, 5000);
    }
  }

  /**
   * Clean up after execution
   */
  private cleanup(): void {
    if (this.process) {
      // Remove all listeners
      this.process.stdout?.removeAllListeners();
      this.process.stderr?.removeAllListeners();
      this.process.removeAllListeners();
      this.process = null;
    }
  }

  /**
   * Abort current task
   */
  abort(): void {
    if (this.busy && this.process) {
      this.aborted = true;
      this.kill();
    }
  }
}

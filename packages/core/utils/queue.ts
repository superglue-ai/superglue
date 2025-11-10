import { Metadata } from "@superglue/shared";
import { logMessage } from "./logs.js";

interface Process {
  id: string;
  task: () => Promise<void>;
}

export class Queue {
  private queue: Process[] = [];
  private isProcessing = false;
  private jobSet: Set<string> = new Set();
  public type: string;
  public metadata: Metadata;

  constructor(queueType: string = "queue", metadata: Metadata) {
    this.type = queueType;
    this.metadata = metadata;
  }

  enqueue(id: string, task: () => Promise<void>) {
    if (!this.jobSet.has(id)) {
      this.queue.push({ id, task });
      this.jobSet.add(id);
      this.processQueue();
    } else {
      logMessage(
        "info",
        `Job with ID ${id} is already in the queue.`,
        this.metadata,
      );
    }
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (job) {
        try {
          logMessage(
            "info",
            `Processing ${this.type} ${job.id}`,
            this.metadata,
          );
          await job.task();
        } catch (error) {
          logMessage(
            "error",
            `Error processing ${this.type} ${job.id}:`,
            this.metadata,
          );
        } finally {
          this.jobSet.delete(job.id);
        }
      }
    }

    this.isProcessing = false;
  }
}

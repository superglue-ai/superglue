import type { ComputeRequest, ComputeResponse, TaskType } from './compute-worker';
import { globalCache } from '../lib/weak-cache';

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class WorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestId = 0;
  private readonly TIMEOUT_MS = 30000;

  private initWorker() {
    if (this.worker) return;

    try {
      this.worker = new Worker(
        new URL('./compute-worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<ComputeResponse>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.restartWorker();
      };
    } catch (error) {
      console.error('Failed to create worker:', error);
    }
  }

  private handleWorkerMessage(response: ComputeResponse) {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error));
    } else {
      pending.resolve(response.result);
    }
  }

  private restartWorker() {
    const failedRequests = Array.from(this.pendingRequests.values());
    
    this.terminate();
    this.initWorker();

    for (const req of failedRequests) {
      req.reject(new Error('Worker restarted'));
    }
  }

  getCached(data: any, taskType: TaskType): any | null {
    return globalCache.get(data, taskType);
  }

  async compute<T = any>(taskType: TaskType, data: any): Promise<T> {
    if (data === null || data === undefined) {
      throw new Error('Data cannot be null or undefined');
    }

    const cached = this.getCached(data, taskType);
    if (cached !== null) {
      return cached;
    }

    this.initWorker();
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = `req_${++this.requestId}`;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Computation timeout'));
      }, this.TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const request: ComputeRequest = {
        id,
        task: { type: taskType, data },
      };

      this.worker!.postMessage(request);
    }).then((result) => {
      globalCache.set(data, taskType, result);
      return result;
    });
  }

  clearCache() {
    globalCache.clear();
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.pendingRequests.clear();
    globalCache.clear();
  }
}

export const workerManager = new WorkerManager();

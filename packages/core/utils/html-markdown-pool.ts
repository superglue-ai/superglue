import { existsSync } from 'fs';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { server_defaults } from '../default.js';

interface PendingTask {
    resolve: (markdown: string) => void;
    reject: (error: Error) => void;
    timeoutHandle: NodeJS.Timeout;
}

export class HtmlMarkdownPool {
    private workers: Worker[] = [];
    private availableWorkers: Worker[] = [];
    private pendingTasks = new Map<string, PendingTask>();
    private taskQueue: Array<{ html: string; taskId: string; task: PendingTask }> = [];
    private nextTaskId = 0;
    private isShuttingDown = false;

    private readonly poolSize = Math.min(server_defaults.HTML_MARKDOWN_POOL.MAX_WORKERS, cpus().length);
    private readonly taskTimeout = server_defaults.HTML_MARKDOWN_POOL.TASK_TIMEOUT;
    private readonly maxQueueSize = server_defaults.HTML_MARKDOWN_POOL.MAX_QUEUE_SIZE;

    constructor() {
        this.initializeWorkers();
    }

    private initializeWorkers(): void {
        for (let i = 0; i < this.poolSize; i++) {
            const worker = this.createWorker();
            this.workers.push(worker);
            this.availableWorkers.push(worker);
        }
    }

    private createWorker(): Worker {
        // For local dev and running tests, try compiled JavaScript in dist folder first, checking for .ts files here is pointless
        const distUrl = new URL('../dist/utils/html-markdown-worker.js', import.meta.url);
        const distPath = fileURLToPath(distUrl);

        if (existsSync(distPath)) {
            const worker = new Worker(distUrl);
            this.attachWorkerEvents(worker);
            return worker;
        }

        // Try JavaScript file (for production)
        const jsUrl = new URL('./html-markdown-worker.js', import.meta.url);
        const jsPath = fileURLToPath(jsUrl);

        if (existsSync(jsPath)) {
            const worker = new Worker(jsUrl);
            this.attachWorkerEvents(worker);
            return worker;
        }

        throw new Error('Worker file not found: No compiled .js file found in dist/utils/ or utils/. Run "npm run build" first.');
    }

    private attachWorkerEvents(worker: Worker): void {
        worker.on('message', (result: { taskId: string; success: boolean; markdown?: string; error?: string }) => {
            const task = this.pendingTasks.get(result.taskId);
            if (!task) return;
            clearTimeout(task.timeoutHandle);
            this.pendingTasks.delete(result.taskId);
            if (result.success) task.resolve(result.markdown ?? '');
            else task.reject(new Error(result.error || 'Worker error'));
            this.availableWorkers.push(worker);
            this.processQueue();
        });

        worker.on('error', () => {
            this.handleWorkerFailure(worker);
        });

        worker.on('exit', (code) => {
            if (code !== 0 && !this.isShuttingDown) this.handleWorkerFailure(worker);
        });
    }

    private handleWorkerFailure(failedWorker: Worker): void {
        console.error('Worker failed', failedWorker);
        const availableIndex = this.availableWorkers.indexOf(failedWorker);
        if (availableIndex > -1) this.availableWorkers.splice(availableIndex, 1);
        const workerIndex = this.workers.indexOf(failedWorker);
        if (workerIndex > -1) this.workers.splice(workerIndex, 1);

        if (!this.isShuttingDown && this.workers.length < this.poolSize) {
            const newWorker = this.createWorker();
            this.workers.push(newWorker);
            this.availableWorkers.push(newWorker);
            this.processQueue();
        }
    }

    async convert(html: string): Promise<string> {
        if (this.isShuttingDown) throw new Error('Worker pool is shutting down');

        return new Promise((resolve, reject) => {
            const taskId = `task-${this.nextTaskId++}`;
            const timeoutHandle = setTimeout(() => {
                this.pendingTasks.delete(taskId);
                reject(new Error('HTML conversion timeout'));
            }, this.taskTimeout);

            const task: PendingTask = { resolve, reject, timeoutHandle };
            const worker = this.availableWorkers.pop();

            if (worker) {
                this.pendingTasks.set(taskId, task);
                worker.postMessage({ html, taskId });
            } else {
                if (this.taskQueue.length >= this.maxQueueSize) {
                    clearTimeout(timeoutHandle);
                    reject(new Error(`Queue full (${this.maxQueueSize} tasks waiting)`));
                    return;
                }
                this.taskQueue.push({ html, taskId, task });
            }
        });
    }

    private processQueue(): void {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) return;
        const worker = this.availableWorkers.pop();
        const queued = this.taskQueue.shift();
        if (worker && queued) {
            this.pendingTasks.set(queued.taskId, queued.task);
            worker.postMessage({ html: queued.html, taskId: queued.taskId });
        }
    }

    async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        for (const { task } of this.taskQueue) {
            clearTimeout(task.timeoutHandle);
            task.reject(new Error('Worker pool shutting down'));
        }
        this.taskQueue = [];
        for (const [, task] of this.pendingTasks) {
            clearTimeout(task.timeoutHandle);
            task.reject(new Error('Worker pool shutting down'));
        }
        this.pendingTasks.clear();
        await Promise.all(this.workers.map(w => w.terminate()));
        this.workers = [];
        this.availableWorkers = [];
    }

    getStats() {
        return {
            poolSize: this.poolSize,
            totalWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            pendingTasks: this.pendingTasks.size,
            queuedTasks: this.taskQueue.length
        };
    }
}

let sharedPool: HtmlMarkdownPool | null = null;

export function getSharedHtmlMarkdownPool(): HtmlMarkdownPool {
    if (!sharedPool) {
        sharedPool = new HtmlMarkdownPool();
    }
    return sharedPool;
}

export async function shutdownSharedHtmlMarkdownPool(): Promise<void> {
    if (sharedPool) {
        await sharedPool.shutdown();
        sharedPool = null;
    }
}

let isShuttingDown = false;
const shutdownHandler = async () => {
    if (!isShuttingDown) {
        isShuttingDown = true;
        await shutdownSharedHtmlMarkdownPool();
    }
};

process.once('SIGINT', shutdownHandler);
process.once('SIGTERM', shutdownHandler);
process.once('beforeExit', shutdownHandler);


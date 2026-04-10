import { Log, LogLevel } from "./types.js";

export interface SSELogSubscriptionOptions {
  onLog?: (log: Log) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  traceId?: string;
  includeDebug?: boolean;
}

export interface SSESubscription {
  unsubscribe: () => void;
}

export class SSELogSubscriptionManager {
  private apiEndpoint: string;
  private apiKey: string;
  private onInfrastructureError?: () => void;
  private controllers: Map<string, AbortController> = new Map();

  constructor(apiEndpoint: string, apiKey: string, onInfrastructureError?: () => void) {
    this.apiEndpoint = apiEndpoint.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.onInfrastructureError = onInfrastructureError;
  }

  async subscribeToLogs(options: SSELogSubscriptionOptions = {}): Promise<SSESubscription> {
    const controller = new AbortController();
    const subscriptionId = Math.random().toString(36).substring(2, 15);
    this.controllers.set(subscriptionId, controller);
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const params = new URLSearchParams();
    if (options.traceId) params.set("traceId", options.traceId);

    const url = `${this.apiEndpoint}/v1/logs/stream${params.toString() ? `?${params}` : ""}`;

    const clearRetry = () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
    };

    const cleanup = () => {
      closed = true;
      clearRetry();
      this.controllers.delete(subscriptionId);
    };

    const scheduleRetry = (attempt: number) => {
      if (closed || controller.signal.aborted) return;
      clearRetry();
      const delayMs = Math.min(1000 * 2 ** attempt, 10000);
      retryTimeout = setTimeout(() => {
        void startStream(attempt + 1);
      }, delayMs);
    };

    const startStream = async (attempt: number = 0) => {
      if (closed || controller.signal.aborted) return;
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const error = new Error(`SSE connection failed: ${response.status}`);
          if (response.status >= 500) {
            this.onInfrastructureError?.();
            options.onError?.(error);
            scheduleRetry(attempt);
            return;
          }
          cleanup();
          options.onError?.(error);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const log: Log = JSON.parse(line.slice(6));
              log.timestamp = new Date(log.timestamp);
              if (options.traceId && log.traceId !== options.traceId) continue;
              if (!options.includeDebug && log.level === LogLevel.DEBUG) continue;
              options.onLog?.(log);
            } catch {}
          }
        }

        if (!closed && !controller.signal.aborted) {
          scheduleRetry(0);
          return;
        }

        cleanup();
        options.onComplete?.();
      } catch (error: any) {
        if (error.name === "AbortError") {
          cleanup();
          return;
        }
        this.onInfrastructureError?.();
        options.onError?.(error);
        scheduleRetry(attempt);
      }
    };

    startStream();

    return {
      unsubscribe: () => {
        const ctrl = this.controllers.get(subscriptionId);
        if (ctrl) {
          cleanup();
          ctrl.abort();
        }
      },
    };
  }

  async disconnect(): Promise<void> {
    for (const [id, controller] of this.controllers) {
      controller.abort();
    }
    this.controllers.clear();
  }
}

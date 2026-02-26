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
  private controllers: Map<string, AbortController> = new Map();

  constructor(apiEndpoint: string, apiKey: string) {
    this.apiEndpoint = apiEndpoint.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async subscribeToLogs(options: SSELogSubscriptionOptions = {}): Promise<SSESubscription> {
    const controller = new AbortController();
    const subscriptionId = Math.random().toString(36).substring(2, 15);
    this.controllers.set(subscriptionId, controller);

    const params = new URLSearchParams();
    if (options.traceId) params.set("traceId", options.traceId);

    const url = `${this.apiEndpoint}/v1/logs/stream${params.toString() ? `?${params}` : ""}`;

    const cleanup = () => this.controllers.delete(subscriptionId);

    const startStream = async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          cleanup();
          options.onError?.(new Error(`SSE connection failed: ${response.status}`));
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

        cleanup();
        options.onComplete?.();
      } catch (error: any) {
        cleanup();
        if (error.name === "AbortError") return;
        options.onError?.(error);
      }
    };

    startStream();

    return {
      unsubscribe: () => {
        const ctrl = this.controllers.get(subscriptionId);
        if (ctrl) {
          ctrl.abort();
          this.controllers.delete(subscriptionId);
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

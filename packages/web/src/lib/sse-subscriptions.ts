export interface Log {
  id: string;
  message: string;
  level: string;
  timestamp: Date;
  traceId?: string;
  orgId?: string;
}

export interface LogSubscriptionCallbacks {
  onLog: (log: Log) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export class SSESubscriptionClient {
  private apiEndpoint: string;
  private apiKey: string;
  private controllers: Set<AbortController> = new Set();

  constructor(apiEndpoint: string, apiKey: string) {
    this.apiEndpoint = apiEndpoint.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  subscribeLogs(callbacks: LogSubscriptionCallbacks, traceId?: string) {
    const controller = new AbortController();
    this.controllers.add(controller);

    const params = new URLSearchParams();
    if (traceId) params.set("traceId", traceId);
    const url = `${this.apiEndpoint}/v1/logs/stream${params.toString() ? `?${params}` : ""}`;

    const run = async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          callbacks.onError?.(new Error(`SSE connection failed: ${response.status}`));
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
              const raw = JSON.parse(line.slice(6));
              const log: Log = { ...raw, timestamp: new Date(raw.timestamp) };
              callbacks.onLog(log);
            } catch {}
          }
        }

        callbacks.onComplete?.();
      } catch (error: any) {
        if (error.name === "AbortError") return;
        callbacks.onError?.(error);
      } finally {
        this.controllers.delete(controller);
      }
    };

    run();

    return () => {
      controller.abort();
      this.controllers.delete(controller);
    };
  }

  disconnect() {
    for (const controller of this.controllers) {
      controller.abort();
    }
    this.controllers.clear();
  }
}

import { createClient } from "graphql-ws";

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

export class GraphQLSubscriptionClient {
  private client: ReturnType<typeof createClient> | null = null;
  private wsUrl: string;
  private apiKey: string;

  constructor(endpoint: string, apiKey: string) {
    // Convert HTTP endpoint to WebSocket
    const url = new URL(endpoint);
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    this.wsUrl = `${wsProtocol}//${url.host}${url.pathname}`;
    this.apiKey = apiKey;
  }

  connect() {
    if (this.client) return;

    this.client = createClient({
      url: this.wsUrl,
      connectionParams: {
        Authorization: `Bearer ${this.apiKey}`, // Changed from lowercase 'authorization'
      },
      retryAttempts: 3,
      shouldRetry: () => true,
    });
  }

  subscribeLogs(callbacks: LogSubscriptionCallbacks, traceId?: string) {
    if (!this.client) {
      this.connect();
    }

    const subscription = `
      subscription LogsSubscription {
        logs {
          id
          message
          level
          timestamp
          traceId
        }
      }
    `;

    const unsubscribe = this.client!.subscribe(
      {
        query: subscription,
        variables: {},
      },
      {
        next: (data: any) => {
          if (data.data?.logs) {
            const log = data.data.logs as Log;
            callbacks.onLog(log);
          }
        },
        error: (error) => {
          callbacks.onError?.(error as Error);
        },
        complete: () => {
          callbacks.onComplete?.();
        },
      },
    );

    return unsubscribe;
  }

  disconnect() {
    if (this.client) {
      this.client.dispose();
      this.client = null;
    }
  }
}

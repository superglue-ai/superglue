import { Log, LogLevel } from "./types.js";
import { createClient, Client } from 'graphql-ws';

export interface LogSubscriptionOptions {
  onLog?: (log: Log) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  runId?: string;
  includeDebug?: boolean;
}

export interface WebSocketSubscription {
  unsubscribe: () => void;
}

export class WebSocketManager {
  private wsEndpoint: string;
  private apiKey: string;
  private client: Client | null = null;
  private subscriptions: Map<string, () => void> = new Map();

  constructor(endpoint: string, apiKey: string) {
    this.wsEndpoint = endpoint.replace('https:', 'wss:').replace('http:', 'ws:');
    this.apiKey = apiKey;
  }

  private initClient(): Client {
    if (!this.client) {
      this.client = createClient({
        url: this.wsEndpoint,
        connectionParams: {
          Authorization: `Bearer ${this.apiKey}`
        },
        retryAttempts: Infinity,
        shouldRetry: () => true,
        retryWait: (retries) => new Promise((resolve) => 
          setTimeout(resolve, Math.min(retries * 1000, 5000))
        ),
        keepAlive: 10000,
      });
    }
    return this.client;
  }

  async subscribeToLogs(options: LogSubscriptionOptions = {}): Promise<WebSocketSubscription> {
    const client = this.initClient();
    
    const unsubscribe = client.subscribe(
      {
        query: `
          subscription OnNewLog {
            logs {
              id
              message
              level
              timestamp
              runId
            }
          }
        `
      },
      {
        next: (data: any) => {
          if (data.data?.logs) {
            const log: Log = {
              ...data.data.logs,
              timestamp: new Date(data.data.logs.timestamp)
            };

            if (!options.runId || log.runId === options.runId) {
              if (options.includeDebug || log.level !== LogLevel.DEBUG) {
                options.onLog?.(log);
              }
            }
          }
        },
        error: (error: any) => {
          options.onError?.(error);
        },
        complete: () => {
          options.onComplete?.();
        }
      }
    );

    const subscriptionId = Math.random().toString(36).substring(2, 15);
    this.subscriptions.set(subscriptionId, unsubscribe);

    return {
      unsubscribe: () => {
        const unsub = this.subscriptions.get(subscriptionId);
        if (unsub) {
          unsub();
          this.subscriptions.delete(subscriptionId);
        }
      }
    };
  }

  async disconnect(): Promise<void> {
    for (const [subscriptionId, unsubscribe] of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions.clear();

    if (this.client) {
      this.client.dispose();
      this.client = null;
    }
  }
}


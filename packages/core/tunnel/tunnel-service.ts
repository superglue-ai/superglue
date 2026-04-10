import { ServiceMetadata, System, Tool, ToolStep, TunnelConnection } from "@superglue/shared";
import { FastifyInstance } from "fastify";
import * as net from "net";
import { v4 as uuidv4 } from "uuid";
import { WebSocket, WebSocketServer } from "ws";
import { validateToken } from "../auth/auth.js";
import { logMessage } from "../utils/logs.js";
import { getTunnelRegistry, TunnelRegistryStrategy } from "./tunnel-registry.js";
import {
  AgentMessage,
  OpenTunnelMessage,
  RegisterMessage,
  TunnelResult,
  TunnelServiceOptions,
} from "./tunnel-types.js";

const DEFAULT_OPTIONS: TunnelServiceOptions = {
  pingIntervalMs: 30000,
  connectionTimeoutMs: 30000,
};

// ============================================================================
// Tunnel URL Utilities
// ============================================================================

/**
 * Protocol mapping for tunnel URL rewriting.
 * Maps original protocols to the protocol used over the tunnel.
 */
const TUNNEL_PROTOCOL_MAP: Record<string, string> = {
  http: "http",
  https: "http", // Tunnel handles TLS termination
  postgres: "postgres",
  postgresql: "postgres",
  mssql: "mssql",
  sqlserver: "mssql",
  redis: "redis",
  rediss: "redis",
  sftp: "sftp",
  ftp: "ftp",
  smb: "smb",
};

/**
 * Rewrite a URL to route through a local tunnel port.
 * Preserves path, query string, and credentials from the original URL.
 *
 * Note: This function expects a fully resolved URL (no template placeholders).
 * For tool execution, use the strategy layer which applies tunnel rewriting
 * after variable resolution.
 */
export function rewriteUrlForTunnel(originalUrl: string, port: number, protocol: string): string {
  const scheme = TUNNEL_PROTOCOL_MAP[protocol.toLowerCase()] || "http";

  try {
    const url = new URL(originalUrl);
    const userinfo = url.username
      ? `${url.username}${url.password ? `:${url.password}` : ""}@`
      : "";
    return `${scheme}://${userinfo}127.0.0.1:${port}${url.pathname}${url.search}`;
  } catch {
    return `${scheme}://127.0.0.1:${port}`;
  }
}

/**
 * Mapping of systemId to tunnel connection info.
 * Used to rewrite URLs after variable resolution.
 */
export type TunnelPortMappings = Record<string, { port: number; protocol: string }>;

/**
 * Result of setting up tunnels for a tool's steps.
 */
export interface TunnelSetupResult {
  /** Mapping of systemId to tunnel port/protocol for URL rewriting */
  tunnelMappings: TunnelPortMappings;
  /** Cleanup functions to call after execution completes */
  cleanups: Array<() => void>;
}

/**
 * Set up tunnels for all steps in a tool that require them.
 * Must be called in the main thread before worker pool execution.
 *
 * Returns tunnel port mappings that should be passed to the worker.
 * URL rewriting happens later in the strategy layer after variable resolution.
 *
 * @param tool - The tool to set up tunnels for
 * @param systems - Systems available for this tool execution
 * @param orgId - Organization ID for tunnel lookup
 * @param metadata - Service metadata for logging
 * @returns Tunnel mappings and cleanup functions
 */
export async function setupTunnelsForTool({
  tool,
  systems,
  orgId,
  metadata,
}: {
  tool: Tool;
  systems: System[];
  orgId: string;
  metadata: ServiceMetadata;
}): Promise<TunnelSetupResult> {
  const cleanups: Array<() => void> = [];
  const tunnelMappings: TunnelPortMappings = {};

  // Collect unique systemIds that need tunneling
  const systemsNeedingTunnels = new Set<string>();
  for (const step of tool.steps) {
    const stepConfig = step.config as { systemId?: string };
    if (stepConfig?.systemId) {
      const system = systems.find((s) => s.id === stepConfig.systemId);
      if (system?.tunnel) {
        systemsNeedingTunnels.add(stepConfig.systemId);
      }
    }
  }

  // Create tunnels for each unique system
  for (const systemId of systemsNeedingTunnels) {
    const system = systems.find((s) => s.id === systemId);
    if (!system?.tunnel) continue;

    try {
      const tunnelService = getTunnelService();
      const { port, protocol, cleanup } = await tunnelService.createTunnel(
        system.tunnel.tunnelId,
        system.tunnel.targetName,
        orgId,
      );
      cleanups.push(cleanup);
      tunnelMappings[systemId] = { port, protocol };
    } catch (error: any) {
      // Clean up any tunnels we already created
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Ignore cleanup errors
        }
      }
      throw new Error(`Failed to create tunnel for system ${system.id}: ${error.message}`);
    }
  }

  if (Object.keys(tunnelMappings).length > 0) {
    logMessage("debug", `Tunnel(s) created for tool ${tool.id}`, metadata);
  }

  return { tunnelMappings, cleanups };
}

/**
 * TunnelService manages WebSocket connections from on-prem agents
 * and creates tunnels for tool execution.
 */
export class TunnelService {
  private wss: WebSocketServer | null = null;
  private registry: TunnelRegistryStrategy;
  private options: TunnelServiceOptions;
  private pingIntervals = new Map<WebSocket, NodeJS.Timeout>();

  constructor(options: TunnelServiceOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.registry = getTunnelRegistry();
  }

  /**
   * Attach the tunnel WebSocket server to a Fastify instance
   */
  attachToServer(fastify: FastifyInstance): void {
    // Create WebSocket server that shares the HTTP server
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests for /ws/tunnels path
    fastify.server.on("upgrade", async (request, socket, head) => {
      const url = new URL(request.url || "", `http://${request.headers.host}`);

      if (url.pathname !== "/ws/tunnels") {
        return; // Let other handlers deal with it
      }

      // Authenticate the connection
      const tunnelId = request.headers["x-tunnel-id"] as string;
      const requestId = request.headers["x-request-id"] as string;
      const authHeader = request.headers["authorization"] as string;

      if (!authHeader?.startsWith("Bearer ")) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const apiKey = authHeader.slice(7);
      const authResult = await validateToken(apiKey);

      if (!authResult.success || !authResult.orgId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Upgrade the connection
      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        if (requestId) {
          // This is a data channel connection
          this.handleDataChannel(ws, tunnelId, requestId, authResult.orgId!);
        } else if (tunnelId) {
          // This is a control channel connection
          this.handleControlChannel(ws, tunnelId, authResult.orgId!);
        } else {
          ws.close(4000, "Missing tunnel_id header");
        }
      });
    });

    logMessage("debug", "Tunnel WebSocket server initialized", {});
  }

  /**
   * Handle a control channel connection from an agent
   */
  private handleControlChannel(ws: WebSocket, tunnelId: string, orgId: string): void {
    // Set up ping interval
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, this.options.pingIntervalMs);
    this.pingIntervals.set(ws, pingInterval);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as AgentMessage;
        this.handleAgentMessage(ws, tunnelId, orgId, message);
      } catch (error) {
        logMessage("warn", `Invalid message from tunnel ${tunnelId}: ${error}`, { orgId });
      }
    });

    ws.on("close", () => {
      logMessage("debug", `Tunnel disconnected: ${tunnelId}`, { orgId });
      this.registry.unregister(tunnelId, orgId);
      const interval = this.pingIntervals.get(ws);
      if (interval) {
        clearInterval(interval);
        this.pingIntervals.delete(ws);
      }
    });

    ws.on("error", (error) => {
      logMessage("error", `Tunnel error for ${tunnelId}: ${error}`, { orgId });
    });
  }

  /**
   * Handle messages from an agent on the control channel
   */
  private handleAgentMessage(
    ws: WebSocket,
    tunnelId: string,
    orgId: string,
    message: AgentMessage,
  ): void {
    switch (message.type) {
      case "register":
        this.handleRegister(ws, tunnelId, orgId, message as RegisterMessage);
        break;
      case "pong":
        // Agent responded to ping, connection is alive
        break;
      default:
        logMessage(
          "warn",
          `Unknown message type from tunnel ${tunnelId}: ${(message as any).type}`,
          {
            orgId,
          },
        );
    }
  }

  /**
   * Handle agent registration
   */
  private handleRegister(
    ws: WebSocket,
    tunnelId: string,
    orgId: string,
    message: RegisterMessage,
  ): void {
    const connection: TunnelConnection = {
      id: tunnelId,
      orgId,
      connectedAt: new Date().toISOString(),
      targets: message.targets || [],
    };

    this.registry.register(connection, ws);

    logMessage(
      "debug",
      `Tunnel registered: ${tunnelId} with ${message.targets?.length || 0} targets`,
      { orgId },
    );
  }

  /**
   * Handle a data channel connection (for actual tunnel traffic)
   */
  private handleDataChannel(
    ws: WebSocket,
    tunnelId: string,
    requestId: string,
    orgId: string,
  ): void {
    // Resolve the pending request
    const resolved = this.registry.resolvePendingRequest(tunnelId, orgId, requestId, ws);
    if (!resolved) {
      logMessage("warn", `No pending request found for ${tunnelId}/${requestId}`, { orgId });
      ws.close(4004, "No pending request");
    }
  }

  /**
   * Create a tunnel to a target through an agent.
   * Returns a local TCP server port that can be used to connect to the target.
   *
   * Architecture for multi-step tool support:
   * - Main thread: createTunnel() → creates TCP server (no WebSocket yet) → returns port
   * - Worker thread: Step 1 connects to port → TCP server creates NEW WebSocket data channel → uses it → disconnects
   * - Worker thread: Step 2 connects to port → TCP server creates ANOTHER NEW WebSocket data channel → uses it → disconnects
   */
  async createTunnel(tunnelId: string, targetName: string, orgId: string): Promise<TunnelResult> {
    const tunnel = this.registry.get(tunnelId, orgId);
    if (!tunnel) {
      throw new Error(`Tunnel ${tunnelId} not connected`);
    }

    const target = tunnel.connection.targets.find((t) => t.name === targetName);
    if (!target) {
      throw new Error(`Target ${targetName} not found on tunnel ${tunnelId}`);
    }

    const createDataChannel = async (): Promise<WebSocket> => {
      const requestId = uuidv4();

      const dataSocketPromise = new Promise<WebSocket>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.registry.removePendingRequest(tunnelId, orgId, requestId);
          reject(new Error("Tunnel connection timeout"));
        }, this.options.connectionTimeoutMs);

        this.registry.addPendingRequest(tunnelId, orgId, requestId, (socket) => {
          clearTimeout(timeout);
          resolve(socket);
        });
      });

      const openMessage: OpenTunnelMessage = {
        type: "open_tunnel",
        tunnelId,
        target: targetName,
        requestId,
      };

      if (tunnel.controlSocket.readyState !== WebSocket.OPEN) {
        this.registry.removePendingRequest(tunnelId, orgId, requestId);
        throw new Error(`Tunnel ${tunnelId} control socket is not open`);
      }

      try {
        tunnel.controlSocket.send(JSON.stringify(openMessage));
      } catch (err) {
        this.registry.removePendingRequest(tunnelId, orgId, requestId);
        throw new Error(
          `Failed to send open_tunnel command: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      return dataSocketPromise;
    };

    const activeDataSockets: Set<WebSocket> = new Set();

    const server = net.createServer(async (clientSocket) => {
      try {
        const dataSocket = await createDataChannel();
        activeDataSockets.add(dataSocket);

        // Buffer for server-speaks-first protocols (MySQL greeting, PostgreSQL auth, etc.)
        const pendingMessages: Buffer[] = [];
        let pendingMessagesSize = 0;
        const MAX_PENDING_BUFFER_SIZE = 1024 * 1024;
        let clientReady = false;

        dataSocket.on("message", (data) => {
          if (clientReady) {
            clientSocket.write(data as Buffer);
          } else {
            const chunk = data as Buffer;
            pendingMessagesSize += chunk.length;
            if (pendingMessagesSize > MAX_PENDING_BUFFER_SIZE) {
              logMessage("warn", `Tunnel pending buffer exceeded max size (tunnelId=${tunnelId})`, {
                orgId,
              });
              dataSocket.close();
              clientSocket.destroy();
              return;
            }
            pendingMessages.push(chunk);
          }
        });

        clientReady = true;
        for (const msg of pendingMessages) {
          clientSocket.write(msg);
        }

        clientSocket.on("data", (data) => {
          if (dataSocket.readyState === WebSocket.OPEN) {
            dataSocket.send(data);
          }
        });

        clientSocket.on("close", () => {
          activeDataSockets.delete(dataSocket);
          dataSocket.close();
        });

        clientSocket.on("error", () => {
          activeDataSockets.delete(dataSocket);
          dataSocket.close();
        });

        dataSocket.on("close", () => {
          activeDataSockets.delete(dataSocket);
          clientSocket.destroy();
        });

        dataSocket.on("error", () => {
          activeDataSockets.delete(dataSocket);
          clientSocket.destroy();
        });
      } catch (err) {
        logMessage(
          "error",
          `Failed to create data channel for tunnel ${tunnelId}: ${err instanceof Error ? err.message : String(err)}`,
          { orgId },
        );
        clientSocket.destroy();
      }
    });

    server.on("error", (err) => {
      logMessage("error", `Tunnel TCP server error (tunnelId=${tunnelId}): ${err.message}`, {
        orgId,
      });
    });

    // Listen on a random port
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as net.AddressInfo;
    const port = address.port;

    return {
      port,
      protocol: target.protocol,
      cleanup: () => {
        // Close all active data sockets
        for (const dataSocket of activeDataSockets) {
          dataSocket.close();
        }
        activeDataSockets.clear();
        server.close();
      },
    };
  }

  /**
   * List all connected tunnels for an organization
   */
  listTunnels(orgId: string): TunnelConnection[] {
    return this.registry.list(orgId);
  }

  /**
   * Get a specific tunnel connection
   */
  getTunnel(tunnelId: string, orgId: string): TunnelConnection | null {
    const tunnel = this.registry.get(tunnelId, orgId);
    return tunnel?.connection || null;
  }

  /**
   * Check if a tunnel is connected
   */
  isConnected(tunnelId: string, orgId: string): boolean {
    return this.registry.isConnected(tunnelId, orgId);
  }

  /**
   * Test connectivity to a tunnel by sending a ping
   */
  async testTunnel(
    tunnelId: string,
    orgId: string,
  ): Promise<{ connected: boolean; latencyMs?: number }> {
    const socket = this.registry.getSocket(tunnelId, orgId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return { connected: false };
    }

    const start = Date.now();

    return new Promise((resolve) => {
      const pongHandler = () => {
        clearTimeout(timeout);
        socket.off("pong", pongHandler);
        resolve({ connected: true, latencyMs: Date.now() - start });
      };

      const timeout = setTimeout(() => {
        socket.off("pong", pongHandler);
        resolve({ connected: false });
      }, 5000);

      socket.on("pong", pongHandler);
      socket.ping();
    });
  }
}

// Singleton instance
let tunnelService: TunnelService | null = null;

export function getTunnelService(): TunnelService {
  if (!tunnelService) {
    tunnelService = new TunnelService();
  }
  return tunnelService;
}

export function initTunnelService(options?: TunnelServiceOptions): TunnelService {
  tunnelService = new TunnelService(options);
  return tunnelService;
}

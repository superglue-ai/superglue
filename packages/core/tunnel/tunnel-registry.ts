import { TunnelConnection } from "@superglue/shared";
import { WebSocket } from "ws";
import { ConnectedTunnel } from "./tunnel-types.js";

/**
 * Strategy interface for tunnel registry implementations.
 * Allows for different storage backends (in-memory, Redis, etc.)
 */
export interface TunnelRegistryStrategy {
  /**
   * Register a new tunnel connection
   */
  register(connection: TunnelConnection, socket: WebSocket): void;

  /**
   * Unregister a tunnel connection
   */
  unregister(tunnelId: string, orgId: string): void;

  /**
   * Get a specific tunnel connection
   */
  get(tunnelId: string, orgId: string): ConnectedTunnel | null;

  /**
   * List all tunnel connections for an organization
   */
  list(orgId: string): TunnelConnection[];

  /**
   * Check if a tunnel is connected
   */
  isConnected(tunnelId: string, orgId: string): boolean;

  /**
   * Get the WebSocket for a tunnel (for sending messages)
   */
  getSocket(tunnelId: string, orgId: string): WebSocket | null;

  /**
   * Store a pending request resolver for a tunnel
   */
  addPendingRequest(
    tunnelId: string,
    orgId: string,
    requestId: string,
    resolver: (socket: WebSocket) => void,
  ): void;

  /**
   * Resolve a pending request with the data socket
   */
  resolvePendingRequest(
    tunnelId: string,
    orgId: string,
    requestId: string,
    socket: WebSocket,
  ): boolean;

  /**
   * Remove a pending request (e.g., on timeout)
   */
  removePendingRequest(tunnelId: string, orgId: string, requestId: string): void;
}

/**
 * In-memory implementation of the tunnel registry.
 * Suitable for single-node deployments.
 */
export class InMemoryTunnelRegistry implements TunnelRegistryStrategy {
  // Key format: `${orgId}:${tunnelId}`
  private tunnels = new Map<string, ConnectedTunnel>();

  private makeKey(tunnelId: string, orgId: string): string {
    return `${orgId}:${tunnelId}`;
  }

  register(connection: TunnelConnection, socket: WebSocket): void {
    const key = this.makeKey(connection.id, connection.orgId);

    // Close existing connection if any
    const existing = this.tunnels.get(key);
    if (existing) {
      try {
        existing.controlSocket.close();
      } catch {
        // Ignore close errors
      }
    }

    this.tunnels.set(key, {
      connection,
      controlSocket: socket,
      pendingRequests: new Map(),
    });
  }

  unregister(tunnelId: string, orgId: string): void {
    const key = this.makeKey(tunnelId, orgId);
    const tunnel = this.tunnels.get(key);

    if (tunnel) {
      // Reject all pending requests
      for (const [, resolver] of tunnel.pendingRequests) {
        // We can't reject directly, but the timeout will handle it
      }
      this.tunnels.delete(key);
    }
  }

  get(tunnelId: string, orgId: string): ConnectedTunnel | null {
    const key = this.makeKey(tunnelId, orgId);
    return this.tunnels.get(key) || null;
  }

  list(orgId: string): TunnelConnection[] {
    const connections: TunnelConnection[] = [];
    for (const [key, tunnel] of this.tunnels) {
      if (key.startsWith(`${orgId}:`)) {
        connections.push(tunnel.connection);
      }
    }
    return connections;
  }

  isConnected(tunnelId: string, orgId: string): boolean {
    const key = this.makeKey(tunnelId, orgId);
    const tunnel = this.tunnels.get(key);
    return (
      tunnel !== null && tunnel !== undefined && tunnel.controlSocket.readyState === WebSocket.OPEN
    );
  }

  getSocket(tunnelId: string, orgId: string): WebSocket | null {
    const tunnel = this.get(tunnelId, orgId);
    return tunnel?.controlSocket || null;
  }

  addPendingRequest(
    tunnelId: string,
    orgId: string,
    requestId: string,
    resolver: (socket: WebSocket) => void,
  ): void {
    const tunnel = this.get(tunnelId, orgId);
    if (tunnel) {
      tunnel.pendingRequests.set(requestId, resolver);
    }
  }

  resolvePendingRequest(
    tunnelId: string,
    orgId: string,
    requestId: string,
    socket: WebSocket,
  ): boolean {
    const tunnel = this.get(tunnelId, orgId);
    if (!tunnel) return false;

    const resolver = tunnel.pendingRequests.get(requestId);
    if (!resolver) return false;

    tunnel.pendingRequests.delete(requestId);
    resolver(socket);
    return true;
  }

  removePendingRequest(tunnelId: string, orgId: string, requestId: string): void {
    const tunnel = this.get(tunnelId, orgId);
    if (tunnel) {
      tunnel.pendingRequests.delete(requestId);
    }
  }
}

// Singleton instance for the default registry
let defaultRegistry: TunnelRegistryStrategy | null = null;

export function getTunnelRegistry(): TunnelRegistryStrategy {
  if (!defaultRegistry) {
    defaultRegistry = new InMemoryTunnelRegistry();
  }
  return defaultRegistry;
}

export function setTunnelRegistry(registry: TunnelRegistryStrategy): void {
  defaultRegistry = registry;
}

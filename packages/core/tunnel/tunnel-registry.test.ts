import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryTunnelRegistry } from "./tunnel-registry.js";
import { TunnelConnection } from "@superglue/shared";
import { WebSocket } from "ws";

// Mock WebSocket for testing
function createMockWebSocket(readyState: number = WebSocket.OPEN): WebSocket {
  return {
    readyState,
    close: () => {},
    send: () => {},
    on: () => {},
    off: () => {},
    ping: () => {},
  } as unknown as WebSocket;
}

describe("InMemoryTunnelRegistry", () => {
  let registry: InMemoryTunnelRegistry;

  beforeEach(() => {
    registry = new InMemoryTunnelRegistry();
  });

  describe("register", () => {
    it("should register a tunnel connection", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [{ name: "api", protocol: "http" }],
      };
      const socket = createMockWebSocket();

      registry.register(connection, socket);

      expect(registry.isConnected("tunnel-1", "org-1")).toBe(true);
      expect(registry.get("tunnel-1", "org-1")).not.toBeNull();
    });

    it("should close existing connection when re-registering same tunnel", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      const socket1 = createMockWebSocket();
      const socket2 = createMockWebSocket();
      let socket1Closed = false;
      (socket1 as any).close = () => {
        socket1Closed = true;
      };

      registry.register(connection, socket1);
      registry.register(connection, socket2);

      expect(socket1Closed).toBe(true);
      expect(registry.getSocket("tunnel-1", "org-1")).toBe(socket2);
    });
  });

  describe("unregister", () => {
    it("should remove a tunnel connection", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      registry.register(connection, createMockWebSocket());

      registry.unregister("tunnel-1", "org-1");

      expect(registry.isConnected("tunnel-1", "org-1")).toBe(false);
      expect(registry.get("tunnel-1", "org-1")).toBeNull();
    });

    it("should handle unregistering non-existent tunnel gracefully", () => {
      expect(() => registry.unregister("non-existent", "org-1")).not.toThrow();
    });
  });

  describe("organization isolation", () => {
    it("should isolate tunnels by organization", () => {
      const connection1: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [{ name: "api", protocol: "http" }],
      };
      const connection2: TunnelConnection = {
        id: "tunnel-1", // Same tunnel ID
        orgId: "org-2", // Different org
        connectedAt: new Date().toISOString(),
        targets: [{ name: "db", protocol: "postgres" }],
      };

      registry.register(connection1, createMockWebSocket());
      registry.register(connection2, createMockWebSocket());

      // Each org should only see their own tunnel
      expect(registry.get("tunnel-1", "org-1")?.connection.targets[0].name).toBe("api");
      expect(registry.get("tunnel-1", "org-2")?.connection.targets[0].name).toBe("db");

      // Org 1 cannot access org 2's tunnel
      expect(registry.get("tunnel-1", "org-1")?.connection.orgId).toBe("org-1");
      expect(registry.get("tunnel-1", "org-2")?.connection.orgId).toBe("org-2");
    });

    it("should list only tunnels for the specified organization", () => {
      const connections = [
        { id: "tunnel-1", orgId: "org-1", connectedAt: new Date().toISOString(), targets: [] },
        { id: "tunnel-2", orgId: "org-1", connectedAt: new Date().toISOString(), targets: [] },
        { id: "tunnel-3", orgId: "org-2", connectedAt: new Date().toISOString(), targets: [] },
      ];

      connections.forEach((c) => registry.register(c, createMockWebSocket()));

      const org1Tunnels = registry.list("org-1");
      const org2Tunnels = registry.list("org-2");

      expect(org1Tunnels).toHaveLength(2);
      expect(org1Tunnels.map((t) => t.id).sort()).toEqual(["tunnel-1", "tunnel-2"]);
      expect(org2Tunnels).toHaveLength(1);
      expect(org2Tunnels[0].id).toBe("tunnel-3");
    });
  });

  describe("isConnected", () => {
    it("should return true for connected tunnel with OPEN socket", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      registry.register(connection, createMockWebSocket(WebSocket.OPEN));

      expect(registry.isConnected("tunnel-1", "org-1")).toBe(true);
    });

    it("should return false for tunnel with CLOSED socket", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      registry.register(connection, createMockWebSocket(WebSocket.CLOSED));

      expect(registry.isConnected("tunnel-1", "org-1")).toBe(false);
    });

    it("should return false for non-existent tunnel", () => {
      expect(registry.isConnected("non-existent", "org-1")).toBe(false);
    });
  });

  describe("pending requests", () => {
    it("should add and resolve pending requests", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      registry.register(connection, createMockWebSocket());

      let resolvedSocket: WebSocket | null = null;
      registry.addPendingRequest("tunnel-1", "org-1", "req-1", (socket) => {
        resolvedSocket = socket;
      });

      const dataSocket = createMockWebSocket();
      const resolved = registry.resolvePendingRequest("tunnel-1", "org-1", "req-1", dataSocket);

      expect(resolved).toBe(true);
      expect(resolvedSocket).toBe(dataSocket);
    });

    it("should return false when resolving non-existent request", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      registry.register(connection, createMockWebSocket());

      const resolved = registry.resolvePendingRequest(
        "tunnel-1",
        "org-1",
        "non-existent",
        createMockWebSocket(),
      );

      expect(resolved).toBe(false);
    });

    it("should remove pending request after resolution", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      registry.register(connection, createMockWebSocket());

      registry.addPendingRequest("tunnel-1", "org-1", "req-1", () => {});
      registry.resolvePendingRequest("tunnel-1", "org-1", "req-1", createMockWebSocket());

      // Second resolution should fail
      const resolved = registry.resolvePendingRequest(
        "tunnel-1",
        "org-1",
        "req-1",
        createMockWebSocket(),
      );
      expect(resolved).toBe(false);
    });

    it("should allow manual removal of pending requests", () => {
      const connection: TunnelConnection = {
        id: "tunnel-1",
        orgId: "org-1",
        connectedAt: new Date().toISOString(),
        targets: [],
      };
      registry.register(connection, createMockWebSocket());

      registry.addPendingRequest("tunnel-1", "org-1", "req-1", () => {});
      registry.removePendingRequest("tunnel-1", "org-1", "req-1");

      const resolved = registry.resolvePendingRequest(
        "tunnel-1",
        "org-1",
        "req-1",
        createMockWebSocket(),
      );
      expect(resolved).toBe(false);
    });
  });
});

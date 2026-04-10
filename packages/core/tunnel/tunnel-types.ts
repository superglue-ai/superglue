import { TunnelConnection, TunnelTarget } from "@superglue/shared";
import { WebSocket } from "ws";

// Protocol messages between cloud and agent
export interface RegisterMessage {
  type: "register";
  tunnelId: string;
  targets: TunnelTarget[];
}

export interface OpenTunnelMessage {
  type: "open_tunnel";
  tunnelId: string;
  target: string;
  requestId: string;
}

export interface TunnelErrorMessage {
  type: "error";
  error: string;
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export type ControlMessage = RegisterMessage | OpenTunnelMessage | PingMessage | PongMessage;
export type AgentMessage = RegisterMessage | TunnelErrorMessage | PongMessage;

// Internal types for tunnel management
export interface ConnectedTunnel {
  connection: TunnelConnection;
  controlSocket: WebSocket;
  pendingRequests: Map<string, (socket: WebSocket) => void>;
}

export interface TunnelResult {
  port: number;
  protocol: string;
  cleanup: () => void;
}

export interface TunnelServiceOptions {
  pingIntervalMs?: number;
  connectionTimeoutMs?: number;
}

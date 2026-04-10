import { useSyncExternalStore } from "react";
import { connectionMonitor, ConnectionState } from "../lib/connection-monitor";

export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(
    (callback) => connectionMonitor.subscribe(callback),
    () => connectionMonitor.getState(),
    () => "connected" as ConnectionState, // Server-side rendering fallback
  );
}

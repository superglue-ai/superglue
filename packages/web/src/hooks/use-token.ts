import { useSyncExternalStore } from "react";
import { tokenRegistry } from "../lib/token-registry";

export function useToken(): string | null {
  return useSyncExternalStore(
    (callback) => tokenRegistry.subscribe(callback),
    () => tokenRegistry.getToken(),
    () => null,
  );
}

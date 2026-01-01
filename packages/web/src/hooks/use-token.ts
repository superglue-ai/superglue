import { useEffect, useState } from "react";
import { tokenRegistry } from "../lib/token-registry";

export function useToken(): string | null {
  const [token, setToken] = useState(null);

  useEffect(() => {
    if (tokenRegistry.hasToken()) {
      setToken(tokenRegistry.getToken());
      return;
    }

    const unsubscribe = tokenRegistry.subscribe(() => {
      setToken(tokenRegistry.getToken());
    });

    return unsubscribe;
  }, []);

  return token;
}

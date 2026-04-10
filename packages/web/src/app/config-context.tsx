"use client";
import { createContext, useContext, ReactNode, useEffect, useRef } from "react";
import { tokenRegistry } from "../lib/token-registry";

export interface ServerSession {
  userId: string;
  email: string;
  orgId: string;
  orgName: string;
  orgStatus: string;
}

export interface Config {
  superglueApiKey: string;
  apiEndpoint: string;
  postHogKey: string;
  postHogHost: string;
  serverSession: ServerSession | null;
}

interface ConfigContextValue {
  apiEndpoint: string;
  postHogKey: string;
  postHogHost: string;
  serverSession: ServerSession | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children, config }: { children: ReactNode; config: Config }) {
  const isInitialTokenSetRef = useRef<boolean>(false);
  if (!isInitialTokenSetRef.current && config.superglueApiKey) {
    tokenRegistry.setToken(config.superglueApiKey);
    isInitialTokenSetRef.current = true;
  }

  useEffect(() => {
    if (config.superglueApiKey) {
      tokenRegistry.setToken(config.superglueApiKey);
    }
  }, [config.superglueApiKey]);

  const { superglueApiKey, ...lightConfig } = config;

  return <ConfigContext.Provider value={lightConfig}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const config = useContext(ConfigContext);
  if (!config) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return config;
}

export function useSupabaseClient(): any {
  return null;
}

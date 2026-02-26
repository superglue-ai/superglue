"use client";
import { createContext, useContext, ReactNode, useEffect, useRef } from "react";
import { tokenRegistry } from "../lib/token-registry";

interface Config {
  superglueApiKey: string;
  apiEndpoint: string;
  postHogKey: string;
  postHogHost: string;
}

interface ConfigWithoutApiKey extends Omit<Config, "superglueApiKey"> {}

const ConfigContext = createContext<ConfigWithoutApiKey | null>(null);

export function ConfigProvider({ children, config }: { children: ReactNode; config: Config }) {
  const isInitialTokenSetRef = useRef<boolean>(false);
  if (!isInitialTokenSetRef.current) {
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

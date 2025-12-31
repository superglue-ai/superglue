"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { tokenRegistry } from "../lib/token-registry";

interface Config {
  superglueEndpoint: string;
  superglueApiKey: string;
  apiEndpoint: string;
  postHogKey: string;
  postHogHost: string;
}

interface ConfigWithoutKey extends Omit<Config, "superglueApiKey"> {}

const ConfigContext = createContext<ConfigWithoutKey | null>(null);

export function ConfigProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config: Config;
}) {
  const initialTokenSetRef = useRef(false);
  if (!initialTokenSetRef.current) {
    initialTokenSetRef.current = true;
    tokenRegistry.setToken(config.superglueApiKey);
  }

  useEffect(() => {
    if (config.superglueApiKey) {
      tokenRegistry.setToken(config.superglueApiKey);
    }
  }, [config.superglueApiKey]);

  // remove it to make sure it won't be used
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

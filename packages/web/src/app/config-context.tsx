"use client"
import { createContext, useContext } from 'react'

interface Config {
  superglueEndpoint: string
  superglueApiKey: string
}

const ConfigContext = createContext<Config | null>(null)

export function ConfigProvider({ children, config }: { children: React.ReactNode, config: Config }) {
  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const config = useContext(ConfigContext)
  if (!config) {
    throw new Error('useConfig must be used within a ConfigProvider')
  }
  return config
} 
import { Integration, SuperglueClient } from '@superglue/client'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useConfig } from './config-context'
import { loadFromCache, saveToCache } from '@/src/lib/cache-utils'

interface IntegrationsContextType {
    integrations: Integration[]
    pendingDocIds: Set<string>
    loading: boolean
    isRefreshing: boolean
    refreshIntegrations: () => Promise<void>
    setPendingDocIds: (updater: (prev: Set<string>) => Set<string>) => void
}

const IntegrationsContext = createContext<IntegrationsContextType | null>(null)

const CACHE_PREFIX = 'superglue-integrations-cache'

interface CachedIntegrations {
    integrations: Integration[]
    pendingDocIds: string[]
    timestamp: number
}

export function IntegrationsProvider({ children }: { children: ReactNode }) {
    const config = useConfig()
    const [integrations, setIntegrations] = useState<Integration[]>([])
    const [pendingDocIds, setPendingDocIds] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const refreshIntegrations = useCallback(async () => {
        setIsRefreshing(true)
        try {
            const client = new SuperglueClient({
                endpoint: config.superglueEndpoint,
                apiKey: config.superglueApiKey,
            })
            const { items } = await client.listIntegrations(100, 0)
            setIntegrations(items)

            // Sync pendingDocIds with backend state
            const pendingIds = items
                .filter(integration => integration.documentationPending)
                .map(integration => integration.id)
            const newPendingDocIds = new Set(pendingIds);
            setPendingDocIds(newPendingDocIds)
            
            saveToCache(config.superglueApiKey, CACHE_PREFIX, {
                integrations: items,
                pendingDocIds: Array.from(newPendingDocIds),
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Error loading integrations:', error)
        } finally {
            setLoading(false)
            setIsRefreshing(false)
        }
    }, [config.superglueEndpoint, config.superglueApiKey])

    useEffect(() => {
        const cachedData = loadFromCache<CachedIntegrations>(config.superglueApiKey, CACHE_PREFIX);
        if (cachedData) {
            setIntegrations(cachedData.integrations);
            setPendingDocIds(new Set(cachedData.pendingDocIds || []));
            setLoading(false);
        } else {
            setLoading(true);
        }
        refreshIntegrations()
    }, [config.superglueEndpoint, config.superglueApiKey])

    return (
        <IntegrationsContext.Provider value={{
            integrations,
            pendingDocIds,
            loading,
            isRefreshing,
            refreshIntegrations,
            setPendingDocIds
        }}>
            {children}
        </IntegrationsContext.Provider>
    )
}

export function useIntegrations() {
    const context = useContext(IntegrationsContext)
    if (!context) {
        throw new Error('useIntegrations must be used within an IntegrationsProvider')
    }
    return context
} 
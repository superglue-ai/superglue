import { Integration, SuperglueClient } from '@superglue/client'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useConfig } from './config-context'

interface IntegrationsContextType {
    integrations: Integration[]
    pendingDocIds: Set<string>
    loading: boolean
    isRefreshing: boolean
    refreshIntegrations: () => Promise<void>
    setPendingDocIds: (updater: (prev: Set<string>) => Set<string>) => void
}

const IntegrationsContext = createContext<IntegrationsContextType | null>(null)

const getCacheKey = (apiKey: string) => {
    const hash = apiKey.split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0;
    }, 0);
    return `superglue-integrations-cache-${Math.abs(hash)}`;
};

const loadCachedIntegrations = (apiKey: string) => {
    try {
        const cached = localStorage.getItem(getCacheKey(apiKey));
        if (!cached) return null;
        return JSON.parse(cached);
    } catch (error) {
        console.error('Error loading cached integrations:', error);
        return null;
    }
};

const saveCachedIntegrations = (apiKey: string, integrations: Integration[], pendingDocIds: Set<string>) => {
    try {
        localStorage.setItem(getCacheKey(apiKey), JSON.stringify({
            integrations,
            pendingDocIds: Array.from(pendingDocIds),
            timestamp: Date.now()
        }));
    } catch (error) {
        console.error('Error saving cached integrations:', error);
    }
};

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
            
            saveCachedIntegrations(config.superglueApiKey, items, newPendingDocIds);
        } catch (error) {
            console.error('Error loading integrations:', error)
        } finally {
            setLoading(false)
            setIsRefreshing(false)
        }
    }, [config.superglueEndpoint, config.superglueApiKey])

    useEffect(() => {
        const cachedData = loadCachedIntegrations(config.superglueApiKey);
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
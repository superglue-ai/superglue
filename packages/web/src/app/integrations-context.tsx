import { Integration, SuperglueClient } from '@superglue/client'
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { useConfig } from './config-context'

interface IntegrationsContextType {
    integrations: Integration[]
    pendingDocIds: Set<string>
    loading: boolean
    refreshIntegrations: () => Promise<void>
    setPendingDocIds: (updater: (prev: Set<string>) => Set<string>) => void
}

const IntegrationsContext = createContext<IntegrationsContextType | null>(null)

export function IntegrationsProvider({ children }: { children: ReactNode }) {
    const config = useConfig()
    const [integrations, setIntegrations] = useState<Integration[]>([])
    const [pendingDocIds, setPendingDocIds] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)

    const client = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
    })

    const refreshIntegrations = async () => {
        setLoading(true)
        try {
            const { items } = await client.listIntegrations(100, 0)
            setIntegrations(items)

            // Sync pendingDocIds with backend state
            const pendingIds = items
                .filter(integration => integration.documentationPending)
                .map(integration => integration.id)
            setPendingDocIds(new Set(pendingIds))
        } catch (error) {
            console.error('Error loading integrations:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refreshIntegrations()
    }, [config.superglueEndpoint, config.superglueApiKey])

    return (
        <IntegrationsContext.Provider value={{
            integrations,
            pendingDocIds,
            loading,
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
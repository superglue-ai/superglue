import { SuperglueClient } from '@superglue/client';
import { useCallback, useEffect, useState } from 'react';

interface UseIntegrationPollingProps {
    client: SuperglueClient;
    integrationIds: string[];
    enabled?: boolean;
    pollInterval?: number;
    continuous?: boolean; // If false, stops polling when all integrations are ready
}

interface PollingResult {
    pendingIds: string[];
    isPolling: boolean;
    hasPending: boolean;
    integrations: any[]; // Full integration objects
    waitForReady: (timeoutMs?: number) => Promise<any[]>; // One-time wait function
}

export function useIntegrationPolling({
    client,
    integrationIds,
    enabled = true,
    pollInterval = 4000,
    continuous = true
}: UseIntegrationPollingProps): PollingResult {
    const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
    const [isPolling, setIsPolling] = useState(false);
    const [integrations, setIntegrations] = useState<any[]>([]);

    // One-time wait function that can be called externally
    const waitForReady = useCallback(async (timeoutMs = 60000): Promise<any[]> => {
        if (integrationIds.length === 0) return [];

        const start = Date.now();
        let prevPending: Record<string, boolean> = {};
        let activeIds = [...integrationIds];

        while (Date.now() - start < timeoutMs && activeIds.length > 0) {
            let settled = await Promise.allSettled(activeIds.map(async (id) => {
                try {
                    return await client.getIntegration(id);
                } catch (e) {
                    return null;
                }
            }));
            settled = settled.filter(r => r !== null);
            const results = settled.map(r => r.status === 'fulfilled' ? r.value : null);

            // Remove deleted integrations from polling
            activeIds = activeIds.filter((id, idx) => results[idx] !== null);

            // Check if any integration is still pending
            const notReady = results.find(i => i && (i.documentationPending === true || !i.documentation));
            if (!notReady) return results.filter(Boolean);

            await new Promise(res => setTimeout(res, pollInterval));
        }

        return [];
    }, [client, integrationIds, pollInterval]);

    useEffect(() => {
        if (!enabled || integrationIds.length === 0) {
            setPendingIds(new Set());
            setIsPolling(false);
            setIntegrations([]);
            return;
        }

        let mounted = true;
        setIsPolling(true);

        const poll = async () => {
            try {
                const results = await Promise.allSettled(
                    integrationIds.map(id => client.getIntegration(id))
                );

                if (!mounted) return;

                const newPendingIds = new Set<string>();
                const validIntegrations: any[] = [];

                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        const integration = result.value;
                        validIntegrations.push(integration);
                        if (integration.documentationPending === true) {
                            newPendingIds.add(integration.id);
                        }
                    }
                });

                setPendingIds(newPendingIds);
                setIntegrations(validIntegrations);

                // Continue polling if continuous mode or if there are still pending integrations
                if ((continuous || newPendingIds.size > 0) && mounted) {
                    setTimeout(poll, pollInterval);
                } else {
                    setIsPolling(false);
                }
            } catch (error) {
                console.error('Error polling integrations:', error);
                if (mounted) {
                    setIsPolling(false);
                }
            }
        };

        poll();

        return () => {
            mounted = false;
        };
    }, [client, integrationIds, enabled, pollInterval, continuous]);

    return {
        pendingIds: Array.from(pendingIds),
        isPolling,
        hasPending: pendingIds.size > 0,
        integrations,
        waitForReady
    };
}
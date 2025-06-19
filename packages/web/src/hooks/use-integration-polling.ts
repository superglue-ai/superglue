import { SuperglueClient } from '@superglue/client';
import { useEffect, useState } from 'react';

interface UseIntegrationPollingProps {
    client: SuperglueClient;
    integrationIds: string[];
    enabled?: boolean;
    pollInterval?: number;
}

export function useIntegrationPolling({
    client,
    integrationIds,
    enabled = true,
    pollInterval = 4000
}: UseIntegrationPollingProps) {
    const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
    const [isPolling, setIsPolling] = useState(false);

    useEffect(() => {
        if (!enabled || integrationIds.length === 0) {
            setPendingIds(new Set());
            setIsPolling(false);
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
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        const integration = result.value;
                        if (integration.documentationPending === true) {
                            newPendingIds.add(integration.id);
                        }
                    }
                });

                setPendingIds(newPendingIds);

                // Continue polling if there are still pending integrations
                if (newPendingIds.size > 0 && mounted) {
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
    }, [client, integrationIds, enabled, pollInterval]);

    return {
        pendingIds: Array.from(pendingIds),
        isPolling,
        hasPending: pendingIds.size > 0
    };
}
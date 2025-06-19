import { SuperglueClient } from '@superglue/client';
import { useCallback } from 'react';

interface UseIntegrationPollingResult {
    waitForIntegrationReady: (integrationIds: string[], timeoutMs?: number) => Promise<any[]>;
}

export function useIntegrationPolling(client: SuperglueClient): UseIntegrationPollingResult {
    const waitForIntegrationReady = useCallback(async (integrationIds: string[], timeoutMs = 60000) => {
        const start = Date.now();
        let activeIds = [...integrationIds];

        while (Date.now() - start < timeoutMs && activeIds.length > 0) {
            let settled = await Promise.allSettled(
                activeIds.map(async (id) => {
                    try {
                        return await client.getIntegration(id);
                    } catch (e) {
                        return null;
                    }
                })
            );
            settled = settled.filter(r => r !== null);
            const results = settled.map(r => r.status === 'fulfilled' ? r.value : null);

            // Remove deleted integrations from polling
            activeIds = activeIds.filter((id, idx) => results[idx] !== null);

            // Check if any integration is still pending
            const notReady = results.find(i => i && (i.documentationPending === true || !i.documentation));
            if (!notReady) return results.filter(Boolean);

            await new Promise(res => setTimeout(res, 4000));
        }

        return [];
    }, [client]);

    return {
        waitForIntegrationReady
    };
} 
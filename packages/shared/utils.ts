import { Integration } from "@superglue/client";

// Accepts: Integration[]
// Returns: { [namespacedKey: string]: string }
// Used for credentials flattening and namespacing across frontend and backend
export function flattenAndNamespaceWorkflowCredentials(
    integrations: Integration[]
): Record<string, string> {
    return integrations.reduce((acc, sys) => {
        Object.entries(sys.credentials || {}).forEach(([key, value]) => {
            acc[`${sys.id}_${key}`] = value;
        });
        return acc;
    }, {} as Record<string, string>);
}

export async function generateUniqueId({
    baseId,
    exists
}: {
    baseId: string;
    exists: (id: string) => Promise<boolean> | boolean;
}): Promise<string> {
    if (!(await exists(baseId))) {
        return baseId;
    }

    let counter = 1;
    const match = baseId.match(/(.*)-(\d+)$/);
    let root = baseId;

    if (match) {
        root = match[1];
        counter = parseInt(match[2], 10) + 1;
    }

    while (true) {
        const newId = `${root}-${counter}`;
        if (!(await exists(newId))) {
            return newId;
        }
        counter++;
    }
}

// Generic integration polling utility
// Works with any client that has a getIntegration method
export async function waitForIntegrationsReady<T extends { getIntegration: (id: string) => Promise<Integration> }>(
    client: T,
    integrationIds: string[],
    timeoutMs: number = 60000
): Promise<Integration[] | { timeout: true; pendingIntegrations: string[] }> {
    const start = Date.now();
    let activeIds = [...integrationIds];

    while (Date.now() - start < timeoutMs && activeIds.length > 0) {
        const settled = await Promise.allSettled(
            activeIds.map(async (id) => {
                try {
                    return await client.getIntegration(id);
                } catch (e) {
                    return null;
                }
            })
        );

        const results = settled.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean) as Integration[];

        // Remove deleted integrations from polling
        activeIds = activeIds.filter((id, idx) => results[idx] !== null);

        // Check if any integration is still pending
        const notReady = results.find(i => i && (i.documentationPending === true || !i.documentation));
        if (!notReady) return results; // All ready!

        // Simple 4-second wait (matching existing pattern)
        await new Promise(res => setTimeout(res, 4000));
    }

    // Return pending integrations for error reporting
    const finalCheck = await Promise.allSettled(
        activeIds.map(async (id) => {
            try {
                return await client.getIntegration(id);
            } catch (e) {
                return null;
            }
        })
    );

    const finalResults = finalCheck.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean) as Integration[];
    const stillPending = finalResults.filter(i => i && i.documentationPending === true).map(i => i.id);

    return { timeout: true, pendingIntegrations: stillPending };
} 

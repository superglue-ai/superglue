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
export async function waitForIntegrationProcessing<T extends { getIntegration: (id: string) => Promise<Integration>; }>(
    client: T,
    integrationIds: string[],
    timeoutMs: number = 60000
): Promise<Integration[]> {
    const start = Date.now();
    let activeIds = [...integrationIds];

    while (Date.now() - start < timeoutMs && activeIds.length > 0) {
        // Use Promise.allSettled for better error handling and parallel requests
        const settled = await Promise.allSettled(
            activeIds.map(async (id) => {
                try {
                    return await client.getIntegration(id);
                } catch (error) {
                    console.warn(`Failed to fetch integration ${id}:`, error);
                    return null;
                }
            })
        );

        const results = settled.map(result =>
            result.status === 'fulfilled' ? result.value : null
        ).filter(Boolean) as Integration[];

        // Remove deleted/failed integrations from active polling
        activeIds = activeIds.filter((id, idx) => settled[idx].status === 'fulfilled' && settled[idx].value !== null);

        // Check if any integration is still pending documentation
        const pendingIntegrations: string[] = [];
        const readyIntegrations: Integration[] = [];

        for (const integration of results) {
            // An integration is considered "not ready" if:
            // 1. documentationPending is explicitly true, OR
            // 2. It has a documentationUrl but no documentation content
            const isDocumentationPending = integration.documentationPending === true;
            const hasUrlButNoContent = integration.documentationUrl &&
                integration.documentationUrl.trim() &&
                (!integration.documentation || !integration.documentation.trim());

            if (isDocumentationPending || hasUrlButNoContent) {
                pendingIntegrations.push(integration.id);
            } else {
                readyIntegrations.push(integration);
            }
        }

        if (pendingIntegrations.length === 0) {
            return results;
        }
        await new Promise(resolve => setTimeout(resolve, 4000));
    }

    // Timeout occurred - return empty array (frontend-compatible)
    // Backend can check if result.length === 0 and handle accordingly
    return [];
}



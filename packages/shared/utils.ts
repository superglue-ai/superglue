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
export async function waitForIntegrationsReady<T extends { getIntegration: (id: string) => Promise<Integration>; }>(
    client: T,
    integrationIds: string[],
    timeoutMs: number = 60000
): Promise<Integration[] | { timeout: true; pendingIntegrations: string[]; }> {
    const start = Date.now();
    let activeIds = [...integrationIds];
    let integrations: Integration[] = [];
    let pendingIntegrations: string[] = [];
    while (Date.now() - start < timeoutMs && activeIds.length > 0) {
        integrations = [];
        pendingIntegrations = [];
        for (const id of activeIds) {
            const integration = await client.getIntegration(id);
            if (integration.documentationPending === true) {
                pendingIntegrations.push(id);
            }
            integrations.push(integration);
        }
        if (pendingIntegrations.length === 0) {
            return integrations;
        }
        // Simple 4-second wait (matching existing pattern)
        await new Promise(res => setTimeout(res, 4000));
    }
    return { timeout: true, pendingIntegrations };
} 

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

// Generic interface for anything that can fetch integrations
interface IntegrationGetter {
    getIntegration(id: string): Promise<Integration | null>;
    getManyIntegrations?(ids: string[]): Promise<Integration[]>;
}

// Generic integration polling utility that works with any integration getter
// Assumes all integrationIds are valid and exist
export async function waitForIntegrationProcessing(
    integrationGetter: IntegrationGetter,
    integrationIds: string[],
    timeoutMs: number = 90000
): Promise<Integration[]> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        let integrations: Integration[];
        if (integrationGetter.getManyIntegrations) {
            integrations = await integrationGetter.getManyIntegrations(integrationIds);
        } else {
            const settled = await Promise.allSettled(
                integrationIds.map(async (id) => {
                    try {
                        return await integrationGetter.getIntegration(id);
                    } catch {
                        return null;
                    }
                })
            );
            integrations = settled.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean) as Integration[];
        }
        const hasPendingDocs = integrations.some(i => i.documentationPending === true);
        if (!hasPendingDocs) return integrations;
        await new Promise(resolve => setTimeout(resolve, 4000));
    }

    throw new Error(
        `Workflow build timed out after ${timeoutMs / 1000} seconds waiting for documentation processing to complete for: ${integrationIds.join(', ')}. Please try again in a few minutes.`
    );
}


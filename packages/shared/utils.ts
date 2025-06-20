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

export async function generateUniqueId(
    baseId: string,
    exists: (id: string) => Promise<boolean> | boolean
): Promise<string> {
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

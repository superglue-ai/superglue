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

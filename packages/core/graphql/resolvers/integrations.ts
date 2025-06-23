import { Integration } from '@superglue/client';
import { Context, Metadata } from "@superglue/shared";
import { generateUniqueId } from '@superglue/shared/utils';
import { GraphQLResolveInfo } from "graphql";
import { Documentation } from '../../utils/documentation.js';
import { logMessage } from '../../utils/logs.js';
import { IntegrationSelector } from '../../workflow/integration-selector.js';

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

function needsDocFetch(input: Integration, oldIntegration?: Integration): boolean {
  if (input.documentationPending === true) return true;

  // If there's manual documentation in the input, no need to fetch
  if (input.documentation && input.documentation.trim() && !input.documentationPending) return false;

  // If there's no documentation URL, no need to fetch
  if (!input.documentationUrl || !input.documentationUrl.trim()) return false;
  // For URL-based docs, fetch if:
  // 1. No old integration exists
  // 2. URL/path has changed
  // 3. Documentation URL has changed
  // 4. Manual refresh: input has documentationUrl but no documentation field (refresh case)
  if (!oldIntegration) return true;
  if (input.urlHost !== oldIntegration.urlHost) return true;
  if (input.urlPath !== oldIntegration.urlPath) return true;
  if (input.documentationUrl !== oldIntegration.documentationUrl) return true;

  // Manual refresh detection: if input has URL but no documentation, and old integration has same URL
  if (input.documentationUrl === oldIntegration.documentationUrl &&
    (!input.documentation || !input.documentation.trim()) &&
    oldIntegration.documentationUrl && oldIntegration.documentationUrl.trim()) {
    return true;
  }

  return false;
}

export const listIntegrationsResolver = async (
  _: any,
  { limit = 10, offset = 0 }: { limit?: number; offset?: number },
  context: Context,
  info: GraphQLResolveInfo
) => {
  try {
    const result = await context.datastore.listIntegrations(limit, offset, context.orgId);
    return {
      items: result.items,
      total: result.total,
    };
  } catch (error) {
    logMessage('error', `Error listing integrations: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const getIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) throw new Error("id is required");
  try {
    const integration = await context.datastore.getIntegration(id, context.orgId);
    if (!integration) throw new Error("Integration not found");
    return integration;
  } catch (error) {
    logMessage('error', `Error getting integration with id ${id}: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const upsertIntegrationResolver = async (
  _: any,
  { input, mode = 'UPSERT' }: { input: Integration, mode?: 'CREATE' | 'UPDATE' | 'UPSERT' },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!input.id) {
    throw new Error("id is required");
  }
  try {
    const now = new Date();
    const oldIntegration = await context.datastore.getIntegration(input.id, context.orgId);

    if (mode === 'CREATE') {
      if (oldIntegration) {
        input.id = await generateUniqueId({
          baseId: input.id,
          exists: async (id) => !!(await context.datastore.getIntegration(id, context.orgId))
        });
      }
    } else if (mode === 'UPDATE' && !oldIntegration) {
      throw new Error(`Integration with ID '${input.id}' not found.`);
    }

    const shouldFetchDoc = needsDocFetch(input, oldIntegration);

    if (shouldFetchDoc) {
      // Fire-and-forget async doc fetch
      (async () => {
        try {
          logMessage('info', `Starting async documentation fetch for integration ${input.id}`, { orgId: context.orgId });
          const docFetcher = new Documentation(
            {
              urlHost: input.urlHost,
              urlPath: input.urlPath,
              documentationUrl: input.documentationUrl,
            },
            input.credentials || {},
            { orgId: context.orgId }
          );
          const docString = await docFetcher.fetchAndProcess();
          // Check if integration still exists before upserting
          const stillExists = await context.datastore.getIntegration(input.id, context.orgId);
          if (!stillExists) {
            logMessage('warn', `Integration ${input.id} was deleted while fetching documentation. Skipping upsert.`, { orgId: context.orgId });
            return;
          }
          await context.datastore.upsertIntegration(input.id, {
            ...input,
            documentation: docString,
            documentationPending: false,
            createdAt: oldIntegration?.createdAt || now,
            updatedAt: new Date(),
          }, context.orgId);
          logMessage('info', `Completed documentation fetch for integration ${input.id}`, { orgId: context.orgId });
        } catch (err) {
          logMessage('error', `Documentation fetch failed for integration ${input.id}: ${String(err)}`, { orgId: context.orgId });
          // Reset documentationPending to false on failure to prevent corrupted state
          try {
            const stillExists = await context.datastore.getIntegration(input.id, context.orgId);
            if (stillExists) {
              await context.datastore.upsertIntegration(input.id, {
                ...input,
                documentationPending: false,
                createdAt: oldIntegration?.createdAt || now,
                updatedAt: new Date(),
              }, context.orgId);
              logMessage('info', `Reset documentationPending to false for integration ${input.id} after fetch failure`, { orgId: context.orgId });
            }
          } catch (resetError) {
            logMessage('error', `Failed to reset documentationPending for integration ${input.id}: ${String(resetError)}`, { orgId: context.orgId });
          }
        }
      })();
    }
    const integration = {
      id: input.id,
      name: resolveField(input.name, oldIntegration?.name, ''),
      urlHost: resolveField(input.urlHost, oldIntegration?.urlHost, ''),
      urlPath: resolveField(input.urlPath, oldIntegration?.urlPath, ''),
      documentationUrl: resolveField(input.documentationUrl, oldIntegration?.documentationUrl, ''),
      documentation: resolveField(input.documentation, oldIntegration?.documentation, ''),
      documentationPending: shouldFetchDoc,
      credentials: resolveField(input.credentials, oldIntegration?.credentials, {}),
      createdAt: oldIntegration?.createdAt || now,
      updatedAt: now
    };
    return await context.datastore.upsertIntegration(input.id, integration, context.orgId);
  } catch (error) {
    logMessage('error', `Error upserting integration with id ${input.id}: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const deleteIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) throw new Error("id is required");
  try {
    return await context.datastore.deleteIntegration(id, context.orgId);
  } catch (error) {
    logMessage('error', `Error deleting integration: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};

export const findRelevantIntegrationsResolver = async (
  _: any,
  { instruction, limit, offset }: { instruction?: string, limit?: number, offset?: number },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const logInstruction = instruction ? `instruction: ${instruction}` : 'no instruction (returning all integrations)';
  logMessage('info', `Finding relevant integrations for ${logInstruction}`, { orgId: context.orgId });

  try {
    const metadata: Metadata = { orgId: context.orgId, runId: crypto.randomUUID() };
    const allIntegrations = await context.datastore.listIntegrations(limit ?? 1000, offset ?? 0, context.orgId);

    if (!allIntegrations || allIntegrations.items.length === 0) {
      logMessage('info', `No integrations found for organization.`, metadata);
      return []; // No integrations exist for this user
    }

    // Filter out integrations with pending documentation
    const availableIntegrations = allIntegrations.items.filter(int => !int.documentationPending);

    if (availableIntegrations.length === 0) {
      logMessage('info', `No integrations with complete documentation found.`, metadata);
      return [];
    }

    // Handle empty/undefined instruction - return all available integrations
    if (!instruction || instruction.trim() === '') {
      logMessage('info', `No instruction provided, returning all available integrations.`, metadata);
      return availableIntegrations.map(int => ({
        id: int.id,
        reason: "Available integration (no specific instruction provided)"
      }));
    }

    const selector = new IntegrationSelector(metadata);
    let suggestedIntegrations = await selector.select(instruction, availableIntegrations);

    if (!suggestedIntegrations || suggestedIntegrations.length === 0) {
      logMessage('info', `Integration selector returned no specific integrations. Returning all available integrations as a fallback.`, metadata);
      suggestedIntegrations = availableIntegrations.map(int => ({
        id: int.id,
        reason: "No specific match found for your request, but this integration is available for use"
      }));
    }

    return suggestedIntegrations;
  } catch (error) {
    logMessage('error', `Error finding relevant integrations: ${String(error)}`, { orgId: context.orgId });
    return [];
  }
};
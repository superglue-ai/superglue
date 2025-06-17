import { Integration } from '@superglue/client';
import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { Documentation } from '../../utils/documentation.js';
import { logMessage } from '../../utils/logs.js';

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

function needsDocFetch(input: Integration, oldIntegration?: Integration): boolean {
  if (!oldIntegration) return true;
  if (!oldIntegration.documentation) return true;
  if (input.urlHost !== oldIntegration.urlHost) return true;
  if (input.urlPath !== oldIntegration.urlPath) return true;
  if (input.documentationUrl !== oldIntegration.documentationUrl) return true;
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
  { input }: { input: Integration },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!input.id) {
    throw new Error("id is required");
  }
  try {
    const now = new Date();
    const oldIntegration = await context.datastore.getIntegration(input.id, context.orgId);
    const shouldFetchDoc = needsDocFetch(input, oldIntegration);
    let documentationPending = false;
    if (shouldFetchDoc) {
      documentationPending = true;
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
      documentationPending: documentationPending,
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
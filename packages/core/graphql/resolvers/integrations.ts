import { Integration } from '@superglue/client';
import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { logMessage } from '../../utils/logs.js';

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
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
    logMessage('error', `Error getting integration: ${String(error)}`, { orgId: context.orgId });
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
    const integration = {
      id: input.id,
      name: resolveField(input.name, oldIntegration?.name, ''),
      urlHost: resolveField(input.urlHost, oldIntegration?.urlHost, ''),
      credentials: resolveField(input.credentials, oldIntegration?.credentials, {}),
      createdAt: oldIntegration?.createdAt || now,
      updatedAt: now
    };
    return await context.datastore.upsertIntegration(input.id, integration, context.orgId);
  } catch (error) {
    logMessage('error', `Error upserting integration: ${String(error)}`, { orgId: context.orgId });
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
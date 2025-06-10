import { Integration } from '@superglue/client';
import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";

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
  const result = await context.datastore.listIntegrations(limit, offset, context.orgId);
  return {
    items: result.items,
    total: result.total,
  };
};

export const getIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) throw new Error("id is required");
  const integration = await context.datastore.getIntegration(id, context.orgId);
  if (!integration) throw new Error("Integration not found");
  return integration;
};

export const upsertIntegrationResolver = async (
  _: any,
  { input }: { input: Integration },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!input.id) throw new Error("id is required");
  const now = new Date();
  const oldIntegration = await context.datastore.getIntegration(input.id, context.orgId);

  const integration = {
    ...oldIntegration,
    ...input,
    createdAt: oldIntegration?.createdAt || now,
    updatedAt: now,
  };

  return await context.datastore.upsertIntegration(input.id, integration, context.orgId);
};

export const deleteIntegrationResolver = async (
  _: any,
  { id }: { id: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) throw new Error("id is required");
  return await context.datastore.deleteIntegration(id, context.orgId);
};
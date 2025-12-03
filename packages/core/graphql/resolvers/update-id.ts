import { ApiConfig, ApiResult } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { GraphQLRequestContext } from '../types.js';

export const updateApiConfigIdResolver = async (
  _: any,
  { oldId, newId }: { oldId: string; newId: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo
) => {
  if (!oldId) {
    throw new Error("oldId is required");
  }
  if (!newId) {
    throw new Error("newId is required");
  }

  // Check if the newId already exists
  const existingConfig = await context.datastore.getApiConfig({ id: newId, orgId: context.orgId });
  if (existingConfig) {
    throw new Error(`Config with ID '${newId}' already exists`);
  }

  // Get the old config
  const oldConfig = await context.datastore.getApiConfig({ id: oldId, orgId: context.orgId });
  if (!oldConfig) {
    throw new Error(`Config with ID '${oldId}' not found`);
  }

  // Create a new config with the new ID
  const newConfig: ApiConfig = {
    ...oldConfig,
    id: newId,
    updatedAt: new Date()
  };

  // Store the new config
  await context.datastore.upsertApiConfig({ id: newId, config: newConfig, orgId: context.orgId });

  // Update all runs associated with this config to use the new config ID
  const { items: allRuns } = await context.datastore.listRuns({ limit: 1000, offset: 0, configId: oldId, orgId: context.orgId });
  for (const run of allRuns) {
    const updatedRun = {
      ...run,
      config: {
        ...run.config,
        id: newId
      }
    } as ApiResult;
    await context.datastore.deleteRun({ id: run.id, orgId: context.orgId });
    await context.datastore.createRun({ result: updatedRun, orgId: context.orgId });
  }

  // Delete the old config
  await context.datastore.deleteApiConfig({ id: oldId, orgId: context.orgId });

  return newConfig;
}; 
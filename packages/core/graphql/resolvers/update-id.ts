import { ApiConfig } from "@superglue/client";
import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";

export const updateApiConfigIdResolver = async (
  _: any,
  { oldId, newId }: { oldId: string; newId: string },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!oldId) {
    throw new Error("oldId is required");
  }
  if (!newId) {
    throw new Error("newId is required");
  }
  
  // Check if the newId already exists
  const existingConfig = await context.datastore.getApiConfig(newId, context.orgId);
  if (existingConfig) {
    throw new Error(`Config with ID '${newId}' already exists`);
  }

  // Get the old config
  const oldConfig = await context.datastore.getApiConfig(oldId, context.orgId);
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
  await context.datastore.upsertApiConfig(newId, newConfig, context.orgId);

  // Update all runs associated with this config to use the new config ID
  const { items: allRuns } = await context.datastore.listRuns(1000, 0, oldId, context.orgId);
  for (const run of allRuns) {
    const updatedRun = {
      ...run,
      config: {
        ...run.config,
        id: newId
      }
    };
    await context.datastore.deleteRun(run.id, context.orgId);
    await context.datastore.createRun(updatedRun, context.orgId);
  }

  // Delete the old config
  await context.datastore.deleteApiConfig(oldId, context.orgId);

  return newConfig;
}; 
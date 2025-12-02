import { Tool } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { logMessage } from "../../utils/logs.js";
import { GraphQLRequestContext } from '../types.js';

export const renameWorkflowResolver = async (
  _: any,
  { oldId, newId }: { oldId: string; newId: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo
): Promise<Tool> => {
  if (!oldId) {
    throw new Error("oldId is required");
  }
  if (!newId) {
    throw new Error("newId is required");
  }

  try {
    return await context.datastore.renameWorkflow({ oldId, newId, orgId: context.orgId });
  } catch (error) {
    logMessage('error', `Error renaming workflow: ${String(error)}`, { orgId: context.orgId });
    throw error;
  }
};


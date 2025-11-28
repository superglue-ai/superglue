import { GraphQLResolveInfo } from "graphql";
import { GraphQLRequestContext } from '../types.js';

export const deleteApiResolver = async (
  _: any,
  { id }: { id: string; },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo
) => {
  const existing = await context.datastore.getApiConfig({ id, orgId: context.orgId });
  if (!existing) {
    throw new Error(`API config with id ${id} not found`);
  }
  return context.datastore.deleteApiConfig({ id, orgId: context.orgId });
};

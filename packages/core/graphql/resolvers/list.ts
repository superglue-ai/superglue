import { GraphQLResolveInfo } from "graphql";
import { GraphQLRequestContext } from "../types.js";

export const listRunsResolver = async (
  _: any,
  { offset, limit, configId }: { offset: number; limit: number; configId: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  const result = await context.datastore.listRuns({
    limit,
    offset,
    configId,
    orgId: context.orgId,
  });
  return result;
};

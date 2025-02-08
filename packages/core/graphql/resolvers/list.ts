import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";

export const listApisResolver = async (
    _: any,
    {offset, limit}: {offset: number, limit: number},
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const result = await context.datastore.listApiConfigs(limit, offset, context.orgId);
    return result;
};

export const listTransformsResolver = async (
    _: any,
    {offset, limit}: {offset: number, limit: number},
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const result = await context.datastore.listTransformConfigs(limit, offset, context.orgId);
    return result;
};

export const listExtractsResolver = async (
    _: any,
    {offset, limit}: {offset: number, limit: number},
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const result = await context.datastore.listExtractConfigs(limit, offset, context.orgId);
    return result;
};

export const listRunsResolver = async (
  _: any,
  {offset, limit}: {offset: number, limit: number},
  context: Context,
  info: GraphQLResolveInfo
) => {
  const result = await context.datastore.listRuns(limit, offset, context.orgId);
  return result;
};

import { GraphQLResolveInfo } from "graphql";
import { Context } from "@superglue/shared";

export const listApisResolver = async (
    _: any,
    {offset, limit}: {offset: number, limit: number},
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const result = await context.datastore.listApiConfigs(limit, offset);
    return result;
};
export const listTransformsResolver = async (
    _: any,
    {offset, limit}: {offset: number, limit: number},
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const result = await context.datastore.listTransformConfigs(limit, offset);
    return result;
};

export const listExtractsResolver = async (
    _: any,
    {offset, limit}: {offset: number, limit: number},
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const result = await context.datastore.listExtractConfigs(limit, offset);
    return result;
};

export const listRunsResolver = async (
  _: any,
  {offset, limit, configId}: {offset: number, limit: number, configId: string},
  context: Context,
  info: GraphQLResolveInfo
) => {
  const result = await context.datastore.listRuns(limit, offset, configId);
  return result;
};

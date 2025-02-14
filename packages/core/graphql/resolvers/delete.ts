import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";

export const deleteApiResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const existing = await context.datastore.getApiConfig(id, context.orgId);
    if (!existing) {
      throw new Error(`API config with id ${id} not found`);
    }
    return context.datastore.deleteApiConfig(id, context.orgId);
};

export const deleteTransformResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    return context.datastore.deleteTransformConfig(id, context.orgId);
};

export const deleteExtractResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    return context.datastore.deleteExtractConfig(id, context.orgId);
};
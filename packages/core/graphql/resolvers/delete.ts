import { GraphQLResolveInfo } from "graphql";
import { Context } from "@superglue/shared";

export const deleteApiResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const existing = await context.datastore.getApiConfig(id);
    if (!existing) {
      throw new Error(`API config with id ${id} not found`);
    }
    return context.datastore.deleteApiConfig(id);
};

export const deleteTransformResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    return context.datastore.deleteTransformConfig(id);
};

export const deleteExtractResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    return context.datastore.deleteExtractConfig(id);
};
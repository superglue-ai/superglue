import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";

export const getApiResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!id) {
      throw new Error("id is required");
    }

    const config = await context.datastore.getApiConfig(id, context.orgId);
    if(!config) throw new Error(`api config with id ${id} not found`);
    return config;
};

export const getTransformResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!id) {
      throw new Error("id is required");
    }

    const config = await context.datastore.getTransformConfig(id, context.orgId);
    if(!config) throw new Error(`transform config with id ${id} not found`);
    return config;
};

export const getExtractResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!id) {
      throw new Error("id is required");
    }

    const config = await context.datastore.getExtractConfig(id, context.orgId);
    if(!config) throw new Error(`extract config with id ${id} not found`);
    return config;
};

export const getRunResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if(!id) {
    throw new Error("id is required");
  }

  const run = await context.datastore.getRun(id, context.orgId);
  if(!run) throw new Error(`run with id ${id} not found`);
  return run;
};
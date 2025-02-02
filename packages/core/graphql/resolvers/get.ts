import { GraphQLResolveInfo } from "graphql";
import { Context } from "@superglue/shared";

export const getApiResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const config = await context.datastore.getApiConfig(id);
    if(!config) throw new Error(`api config with id ${id} not found`);
    return config;
};

export const getTransformResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const config = await context.datastore.getTransformConfig(id);
    if(!config) throw new Error(`transform config with id ${id} not found`);
    return config;
};

export const getExtractResolver = async (
    _: any,
    { id }: { id: string; },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const config = await context.datastore.getExtractConfig(id);
    if(!config) throw new Error(`extract config with id ${id} not found`);
    return config;
};

export const getRunResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const run = await context.datastore.getRun(id);
  if(!run) throw new Error(`run with id ${id} not found`);
  return run;
};
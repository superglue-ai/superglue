import { GraphQLResolveInfo } from "graphql";
import { Context } from '../types.js';

export const deleteApiResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  const existing = await context.datastore.getApiConfig({ id, orgId: context.orgId });
  if (!existing) {
    throw new Error(`API config with id ${id} not found`);
  }
  return context.datastore.deleteApiConfig({ id, orgId: context.orgId });
};

export const deleteTransformResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  return context.datastore.deleteTransformConfig({ id, orgId: context.orgId });
};

export const deleteExtractResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  return context.datastore.deleteExtractConfig({ id, orgId: context.orgId });
};
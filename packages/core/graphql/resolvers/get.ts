import { GraphQLResolveInfo } from 'graphql';
import { telemetryClient } from '../../utils/telemetry.js';
import { Context } from '../types.js';

export const getApiResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) {
    throw new Error("id is required");
  }

  const config = await context.datastore.getApiConfig({ id, orgId: context.orgId });
  if (!config) {
    telemetryClient?.captureException(new Error(`api config with id ${id} not found`), context.orgId, {
      id: id,
    });
    throw new Error(`api config with id ${id} not found`);
  }
  return config;
};

export const getTransformResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) {
    throw new Error("id is required");
  }

  const config = await context.datastore.getTransformConfig({ id, orgId: context.orgId });
  if (!config) {
    telemetryClient?.captureException(new Error(`transform config with id ${id} not found`), context.orgId, {
      id: id,
    });
    throw new Error(`transform config with id ${id} not found`);
  }
  return config;
};

export const getExtractResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) {
    throw new Error("id is required");
  }

  const config = await context.datastore.getExtractConfig({ id, orgId: context.orgId });
  if (!config) {
    telemetryClient?.captureException(new Error(`extract config with id ${id} not found`), context.orgId, {
      id: id,
    });
    throw new Error(`extract config with id ${id} not found`);
  }
  return config;
};

export const getRunResolver = async (
  _: any,
  { id }: { id: string; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) {
    throw new Error("id is required");
  }

  const run = await context.datastore.getRun({ id, orgId: context.orgId });
  if (!run) {
    telemetryClient?.captureException(new Error(`run with id ${id} not found`), context.orgId, {
      id: id,
    });
    throw new Error(`run with id ${id} not found`);
  }
  return run;
};
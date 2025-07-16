import { ApiConfig, ExtractConfig, TransformConfig } from "@superglue/client";
import { Context } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

export const upsertApiResolver = async (
  _: any,
  { id, input }: { id: string; input: ApiConfig; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) {
    throw new Error("id is required");
  }
  const oldConfig = await context.datastore.getApiConfig(id, context.orgId);

  if (!input.urlHost && !oldConfig?.urlHost) {
    throw new Error("urlHost is required.");
  }
  if (!input.instruction && !oldConfig?.instruction) {
    throw new Error("instruction is required");
  }

  const config = {
    urlHost: resolveField(input.urlHost, oldConfig?.urlHost, ''),
    urlPath: resolveField(input.urlPath, oldConfig?.urlPath, ''),
    instruction: resolveField(input.instruction, oldConfig?.instruction, ''),
    createdAt: resolveField(input.createdAt, oldConfig?.createdAt, new Date()),
    updatedAt: new Date(),
    id: id,
    method: resolveField(input.method, oldConfig?.method),
    queryParams: resolveField(input.queryParams, oldConfig?.queryParams),
    headers: resolveField(input.headers, oldConfig?.headers),
    body: resolveField(input.body, oldConfig?.body),
    documentationUrl: resolveField(input.documentationUrl, oldConfig?.documentationUrl),
    responseSchema: resolveField(input.responseSchema, oldConfig?.responseSchema),
    responseMapping: resolveField(input.responseMapping, oldConfig?.responseMapping, "$"),
    authentication: resolveField(input.authentication, oldConfig?.authentication),
    pagination: resolveField(input.pagination, oldConfig?.pagination),
    dataPath: resolveField(input.dataPath, oldConfig?.dataPath),
    version: resolveField(input.version, oldConfig?.version)
  };
  await context.datastore.upsertApiConfig(id, config, context.orgId);
  return config;
};

export const upsertTransformResolver = async (
  _: any,
  { id, input }: { id: string; input: TransformConfig; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) {
    throw new Error("id is required");
  }
  const oldConfig = await context.datastore.getTransformConfig(id, context.orgId);

  // reset the response mapping if there are major updates
  let newResponseMapping = input.responseMapping;
  if (newResponseMapping === undefined && !input.responseSchema && !input.instruction) {
    newResponseMapping = oldConfig?.responseMapping;
  }

  const config = {
    id: id,
    updatedAt: new Date(),
    createdAt: resolveField(input.createdAt, oldConfig?.createdAt, new Date()),
    instruction: resolveField(input.instruction, oldConfig?.instruction, ''),
    responseSchema: resolveField(input.responseSchema, oldConfig?.responseSchema, {}),
    responseMapping: newResponseMapping,
    version: resolveField(input.version, oldConfig?.version)
  };

  await context.datastore.upsertTransformConfig(id, config, context.orgId);
  return config;
};

export const upsertExtractResolver = async (
  _: any,
  { id, input }: { id: string; input: ExtractConfig; },
  context: Context,
  info: GraphQLResolveInfo
) => {
  if (!id) {
    throw new Error("id is required");
  }
  const oldConfig = await context.datastore.getExtractConfig(id, context.orgId);
  const config = {
    id: id,
    urlHost: resolveField(input.urlHost, oldConfig?.urlHost, ''),
    urlPath: resolveField(input.urlPath, oldConfig?.urlPath, ''),
    instruction: resolveField(input.instruction, oldConfig?.instruction, ''),
    createdAt: resolveField(input.createdAt, oldConfig?.createdAt, new Date()),
    updatedAt: new Date(),
    method: resolveField(input.method, oldConfig?.method),
    queryParams: resolveField(input.queryParams, oldConfig?.queryParams),
    headers: resolveField(input.headers, oldConfig?.headers),
    body: resolveField(input.body, oldConfig?.body),
    documentationUrl: resolveField(input.documentationUrl, oldConfig?.documentationUrl),
    decompressionMethod: resolveField(input.decompressionMethod, oldConfig?.decompressionMethod),
    authentication: resolveField(input.authentication, oldConfig?.authentication),
    fileType: resolveField(input.fileType, oldConfig?.fileType),
    dataPath: resolveField(input.dataPath, oldConfig?.dataPath),
    version: resolveField(input.version, oldConfig?.version)
  };
  await context.datastore.upsertExtractConfig(id, config, context.orgId);
  return config;
};
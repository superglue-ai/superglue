import { ApiConfig, Context, ExtractConfig, HttpMethod, TransformConfig } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";

export const upsertApiResolver = async (
    _: any,
    { id, input }: { id: string; input: ApiConfig },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!id) {
      throw new Error("id is required");
    }
    // override id with the id from the input
    const oldConfig = await context.datastore.getApiConfig(id, context.orgId);

    // reset the response mapping if there are major updates
    let newResponseMapping = input.responseMapping;
    const hasNoUpdates = (!input?.urlHost || oldConfig?.urlHost === input?.urlHost) && 
      (!input?.urlPath || oldConfig?.urlPath === input?.urlPath) &&
      (!input?.dataPath || oldConfig?.dataPath === input?.dataPath) &&
      (!input?.body || oldConfig?.body === input?.body) &&
      (!input?.queryParams || oldConfig?.queryParams === input?.queryParams) &&
      (!input?.headers || oldConfig?.headers === input?.headers) &&
      (!input?.instruction || oldConfig?.instruction === input?.instruction);
    if (newResponseMapping === null && hasNoUpdates) {
      newResponseMapping = oldConfig?.responseMapping;
    }

    const config = { 
      method: input.method || oldConfig?.method || HttpMethod.GET,
      urlHost: input.urlHost || oldConfig?.urlHost || '',
      urlPath: input.urlPath || oldConfig?.urlPath || '',
      instruction: input.instruction || oldConfig?.instruction || '',
      createdAt: input.createdAt || oldConfig?.createdAt || new Date(),
      updatedAt: new Date(),
      id: id,
      queryParams: input.queryParams || oldConfig?.queryParams,
      headers: input.headers || oldConfig?.headers,
      body: input.body || oldConfig?.body,
      documentationUrl: input.documentationUrl || oldConfig?.documentationUrl,
      responseSchema: input.responseSchema || oldConfig?.responseSchema,
      responseMapping: newResponseMapping,
      authentication: input.authentication || oldConfig?.authentication,
      pagination: input.pagination || oldConfig?.pagination,
      dataPath: input.dataPath || oldConfig?.dataPath,
      version: input.version || oldConfig?.version
    };
    await context.datastore.upsertApiConfig(id, config, context.orgId);
    return config;
};

export const upsertTransformResolver = async (
    _: any,
    { id, input }: { id: string; input: TransformConfig },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!id) {
      throw new Error("id is required");
    }
    const oldConfig = await context.datastore.getTransformConfig(id, context.orgId);
    const config = { 
      id: id,
      updatedAt: new Date(),
      createdAt: oldConfig?.createdAt || new Date(),
      responseSchema: input.responseSchema || oldConfig?.responseSchema || {},
      responseMapping: input.responseMapping || oldConfig?.responseMapping || "",
    };
    await context.datastore.upsertTransformConfig(id, config, context.orgId);
    return config;
};

export const upsertExtractResolver = async (
    _: any,
    { id, input }: { id: string; input: ExtractConfig },
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    if(!id) {
      throw new Error("id is required");
    }
    const oldConfig = await context.datastore.getExtractConfig(id, context.orgId);
    const config = { 
      id: id,
      method: input.method || oldConfig?.method || HttpMethod.GET,
      urlHost: input.urlHost || oldConfig?.urlHost || '',
      urlPath: input.urlPath || oldConfig?.urlPath || '',
      instruction: input.instruction || oldConfig?.instruction || '',
      createdAt: oldConfig?.createdAt || new Date(),
      updatedAt: new Date(),
      queryParams: input.queryParams || oldConfig?.queryParams,
      headers: input.headers || oldConfig?.headers,
      body: input.body || oldConfig?.body,
      documentationUrl: input.documentationUrl || oldConfig?.documentationUrl,
      decompressionMethod: input.decompressionMethod || oldConfig?.decompressionMethod,
      authentication: input.authentication || oldConfig?.authentication,
      fileType: input.fileType || oldConfig?.fileType,
      dataPath: input.dataPath || oldConfig?.dataPath
    };
    await context.datastore.upsertExtractConfig(id, config, context.orgId);
    return config;
  };
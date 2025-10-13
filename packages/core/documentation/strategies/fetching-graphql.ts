/**
 * GraphQL Introspection Strategy
 * 
 * Attempts to fetch GraphQL schema through introspection queries.
 */

import { ApiConfig } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import { server_defaults } from '../../default.js';
import { logMessage } from "../../utils/logs.js";
import { composeUrl } from "../../utils/tools.js";
import { DocumentationFetchingStrategy } from '../types.js';

export class GraphQLStrategy implements DocumentationFetchingStrategy {
  private async fetchGraphQLSchema(url: string, config: ApiConfig, metadata: Metadata): Promise<any | null> {
    const introspectionQuery = getIntrospectionQuery();

    try {
      const response = await axios.post(
        url,
        {
          query: introspectionQuery,
          operationName: 'IntrospectionQuery'
        },
        { headers: config.headers, params: config.queryParams, timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS }
      );

      if (response.data.errors) {
        return null;
      }
      return response.data?.data?.__schema ?? null;
    } catch (error) {
      return null;
    }
  }

  private isLikelyGraphQL(url: string, config: ApiConfig): boolean {
    if (!url) return false;
    return url?.includes('graphql') ||
      Object.values({ ...config.queryParams, ...config.headers })
        .some(val => typeof val === 'string' && val.includes('IntrospectionQuery'));
  }

  async tryFetch(config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (!config.urlHost?.startsWith("http")) return null;
    const endpointUrl = composeUrl(config.urlHost, config.urlPath);

    const urlIsLikelyGraphQL = this.isLikelyGraphQL(endpointUrl, config);
    const docUrlIsLikelyGraphQL = this.isLikelyGraphQL(config.documentationUrl, config);

    if (!urlIsLikelyGraphQL && !docUrlIsLikelyGraphQL) return null;

    const url = urlIsLikelyGraphQL ? endpointUrl : config.documentationUrl;
    if (!url) {
      return null;
    }

    const schema = await this.fetchGraphQLSchema(url, config, metadata);
    if (schema) {
      logMessage('info', `Successfully fetched GraphQL schema from ${url}.`, metadata);
      return JSON.stringify(schema);
    }
    return null;
  }
}


/**
 * GraphQL Introspection Strategy
 *
 * Attempts to fetch GraphQL schema through introspection queries.
 */

import { ServiceMetadata } from "@superglue/shared";
import axios from "axios";
import { getIntrospectionQuery } from "graphql";
import { server_defaults } from "../../default.js";
import { logMessage } from "../../utils/logs.js";
import { composeUrl } from "../../utils/helpers.js";
import { DocumentationConfig, DocumentationFetchingStrategy } from "../types.js";

export class GraphQLStrategy implements DocumentationFetchingStrategy {
  private async fetchGraphQLSchema(
    url: string,
    config: DocumentationConfig,
    metadata: ServiceMetadata,
  ): Promise<any | null> {
    const introspectionQuery = getIntrospectionQuery();

    try {
      const response = await axios.post(
        url,
        {
          query: introspectionQuery,
          operationName: "IntrospectionQuery",
        },
        {
          headers: config.headers,
          params: config.queryParams,
          timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS,
        },
      );

      if (response.data.errors) {
        return null;
      }
      return response.data?.data?.__schema ?? null;
    } catch (error) {
      return null;
    }
  }

  private isLikelyGraphQL(url: string, config: DocumentationConfig): boolean {
    if (!url) return false;
    return (
      url?.includes("graphql") ||
      Object.values({ ...config.queryParams, ...config.headers }).some(
        (val) => typeof val === "string" && val.includes("IntrospectionQuery"),
      )
    );
  }

  async tryFetch(config: DocumentationConfig, metadata: ServiceMetadata): Promise<string | null> {
    if (!config.url?.startsWith("http")) return null;

    const urlIsLikelyGraphQL = this.isLikelyGraphQL(config.url, config);
    const docUrlIsLikelyGraphQL = this.isLikelyGraphQL(config.documentationUrl, config);

    if (!urlIsLikelyGraphQL && !docUrlIsLikelyGraphQL) return null;

    const targetUrl = urlIsLikelyGraphQL ? config.url : config.documentationUrl;
    if (!targetUrl) {
      return null;
    }

    const schema = await this.fetchGraphQLSchema(targetUrl, config, metadata);
    if (schema) {
      logMessage("info", `Successfully fetched GraphQL schema from ${targetUrl}.`, metadata);
      return JSON.stringify(schema);
    }
    return null;
  }
}

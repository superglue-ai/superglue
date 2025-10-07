/**
 * OpenAPI/Swagger Strategy
 * 
 * Extracts and processes OpenAPI/Swagger specifications.
 * - Handles both JSON and YAML formats
 * - Can discover OpenAPI URLs from HTML pages
 */

import { ApiConfig } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import axios from "axios";
import { server_defaults } from '../../default.js';
import { parseJSON } from "../../utils/json-parser.js";
import { logMessage } from "../../utils/logs.js";
import { composeUrl } from "../../utils/tools.js";
import { extractOpenApiUrlFromHtml } from '../documentation-utils.js';
import { DocumentationProcessingStrategy } from '../types.js';

export class OpenApiStrategy implements DocumentationProcessingStrategy {
  private async fetchOpenApiFromUrl(openApiUrl: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    try {
      let absoluteOpenApiUrl = openApiUrl;
      if (openApiUrl.startsWith("/")) {
        const baseUrl = config.documentationUrl ? new URL(config.documentationUrl).origin : config.urlHost;
        absoluteOpenApiUrl = composeUrl(baseUrl, openApiUrl);
      }
      const openApiResponse = await axios.get(absoluteOpenApiUrl, { headers: config.headers, timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
      const openApiData = openApiResponse.data;

      if (!openApiData) return null;

      if (typeof openApiData === 'object' && openApiData !== null) {
        if (openApiData.openapi || openApiData.swagger) {
          return JSON.stringify(openApiData);
        } else {
          return JSON.stringify(openApiData);
        }
      } else if (typeof openApiData === 'string') {
        try {
          const parsed = parseJSON(openApiData);
          if (parsed && (parsed.openapi || parsed.swagger)) {
            logMessage('info', `Successfully fetched valid OpenAPI/Swagger JSON string from ${absoluteOpenApiUrl}`, metadata);
            return openApiData;
          }
        } catch (e) { }
        const trimmedData = openApiData.trim();
        if (trimmedData.startsWith('openapi:') || trimmedData.startsWith('swagger:')) {
          logMessage('info', `Successfully fetched likely OpenAPI/Swagger YAML string from ${absoluteOpenApiUrl}`, metadata);
          return openApiData;
        }
        return openApiData;
      }

      logMessage('warn', `Unexpected data type received from ${absoluteOpenApiUrl}: ${typeof openApiData}`, metadata);
      return null;

    } catch (error) {
      logMessage('warn', `Failed to fetch or process OpenAPI spec from ${openApiUrl}: ${error?.message}`, metadata);
      return null;
    }
  }

  async tryProcess(content: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (content === undefined || content === null) {
      return null;
    }
    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }
    const trimmedContent = content.trim();
    const isJson = trimmedContent.startsWith('{') && trimmedContent.endsWith('}');
    const isYaml = trimmedContent.startsWith('openapi:') || trimmedContent.startsWith('swagger:');
    const isHtml = trimmedContent.slice(0, 500).toLowerCase().includes("<html");
    if (isJson) {
      try {
        const parsed = parseJSON(trimmedContent);
        if (parsed && (parsed.openapi || parsed.swagger)) {
          logMessage('info', "Provided content is already a valid OpenAPI/Swagger JSON spec.", metadata);
          return trimmedContent;
        }
      } catch (e) { }
    }
    if (isYaml) {
      logMessage('info', "Provided content appears to be an OpenAPI/Swagger YAML spec.", metadata);
      return trimmedContent;
    }
    if (isHtml) {
      const openApiUrl = extractOpenApiUrlFromHtml(content);
      if (!openApiUrl) {
        return null;
      }

      const openApiSpec = await this.fetchOpenApiFromUrl(openApiUrl, config, metadata);
      if (!openApiSpec) {
        return null;
      }

      // Try to convert HTML to Markdown as supplementary info (will be handled by next strategy if available)
      return openApiSpec;
    }
    return null;
  }
}


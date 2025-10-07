import { Metadata } from "@superglue/shared";
import * as yaml from 'js-yaml';

import { OpenApiFetchingStrategy } from '../types.js';
import { logMessage } from "../../utils/logs.js";
import { parseJSON } from "../../utils/json-parser.js";
import { extractOpenApiUrlsFromObject, fetchMultipleOpenApiSpecs } from '../documentation-utils.js';

export class OpenApiLinkExtractorStrategy implements OpenApiFetchingStrategy {
  async tryFetch(responseData: any, openApiUrl: string, metadata: Metadata): Promise<string | null> {
    try {
      let parsedData: any = null;

      if (typeof responseData === 'object' && responseData !== null) {
        parsedData = responseData;
      } else if (typeof responseData === 'string') {
        const trimmedData = responseData.trim();
        try {
          parsedData = parseJSON(trimmedData);
        } catch {
          try {
            parsedData = yaml.load(trimmedData) as any;
          } catch {
            return null;
          }
        }
      } else {
        return null;
      }

      if (typeof parsedData === 'object' && parsedData !== null) {
        const openApiUrls = extractOpenApiUrlsFromObject(parsedData);
        if (openApiUrls.length > 0) {
          logMessage('debug', `Found ${openApiUrls.length} OpenAPI specification links in ${openApiUrl}`, metadata);
          const allSpecs = await fetchMultipleOpenApiSpecs(openApiUrls, metadata);
          
          if (!allSpecs || allSpecs.length === 0) {
            logMessage('debug', `OpenApiLinkExtractorStrategy: No valid specs returned from extracted links for ${openApiUrl}`, metadata);
            return null;
          }

          return allSpecs;
        } else {
          logMessage('debug', `OpenApiLinkExtractorStrategy: No OpenAPI URLs found in response from ${openApiUrl}`, metadata);
        }
      }

      return null;
    } catch (error) {
      logMessage('warn', `OpenApiLinkExtractorStrategy: Unexpected error processing ${openApiUrl}: ${error?.message}`, metadata);
      return null;
    }
  }
}


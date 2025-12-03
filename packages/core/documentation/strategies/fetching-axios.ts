/**
 * Axios HTTP Fetching Strategy
 * 
 * Simple HTTP GET requests for direct documentation URLs.
 */

import { ServiceMetadata } from "@superglue/shared";
import axios from "axios";
import { server_defaults } from '../../default.js';
import { logMessage } from "../../utils/logs.js";
import { DocumentationConfig, DocumentationFetchingStrategy } from '../types.js';

export class AxiosFetchingStrategy implements DocumentationFetchingStrategy {
  async tryFetch(config: DocumentationConfig, metadata: ServiceMetadata): Promise<string | null> {
    if (!config.documentationUrl?.startsWith("http")) return null;

    try {
      const url = new URL(config.documentationUrl);
      if (config.queryParams) {
        Object.entries(config.queryParams).forEach(([key, value]) => {
          url?.searchParams?.append(key, value);
        });
      }

      const response = await axios.get(url.toString(), { headers: config.headers, timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
      let data = response.data;
      return data;
    } catch (error) {
      logMessage('warn', `Axios fetch failed for ${config.documentationUrl}: ${error?.message}`, metadata);
      return null;
    }
  }
}


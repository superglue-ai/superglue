/**
 * PostgreSQL Schema Strategy
 *
 * Generates database schema documentation for PostgreSQL connections.
 */

import { RequestStepConfig, ServiceMetadata } from "@superglue/shared";
import { callPostgres } from "../../tools/strategies/postgres/postgres.js";
import { composeUrl } from "../../utils/helpers.js";
import { logMessage } from "../../utils/logs.js";
import { DocumentationConfig, DocumentationProcessingStrategy } from "../types.js";

export class PostgreSqlStrategy implements DocumentationProcessingStrategy {
  async tryProcess(
    content: string,
    config: DocumentationConfig,
    metadata: ServiceMetadata,
    credentials?: Record<string, any>,
  ): Promise<string | null> {
    if (config.urlHost?.startsWith("postgres://") || config.urlHost?.startsWith("postgresql://")) {
      const url = composeUrl(config.urlHost, config.urlPath);

      const schemaQuery = {
        query: `SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;`,
      };

      // Build a RequestStepConfig with required url field
      const endpoint: RequestStepConfig = {
        url,
        headers: config.headers,
        queryParams: config.queryParams,
        body: JSON.stringify(schemaQuery),
      };

      const schemaResponse = await callPostgres({
        endpoint,
        payload: {},
        credentials,
        options: null,
        metadata: metadata,
      });
      logMessage(
        "info",
        `PostgreSQL Documentation Fetch: Schema retrieved ${schemaResponse.length} rows`,
        metadata,
      );
      if (!schemaResponse) return null;
      return `${content ? `<DOCUMENTATION>\n${content}\n</DOCUMENTATION>\n` : ""}<DB_SCHEMA>\n${JSON.stringify(schemaResponse, null, 2)}\n</DB_SCHEMA>`;
    }
  }
}

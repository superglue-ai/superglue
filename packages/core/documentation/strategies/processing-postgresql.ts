/**
 * PostgreSQL Schema Strategy
 * 
 * Generates database schema documentation for PostgreSQL connections.
 */

import { ApiConfig } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../../utils/logs.js";
import { callPostgres } from '../../utils/postgres.js';
import { composeUrl } from "../../utils/tools.js";
import { DocumentationProcessingStrategy } from '../types.js';

export class PostgreSqlStrategy implements DocumentationProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig, metadata: Metadata, credentials?: Record<string, any>): Promise<string | null> {
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
ORDER BY table_name, ordinal_position;`
      };

      const schemaResponse = await callPostgres({ ...config, body: JSON.stringify(schemaQuery) }, null, credentials, null);
      logMessage('info', `PostgreSQL Documentation Fetch: Schema retrieved ${schemaResponse.length} rows`, metadata);
      if (!schemaResponse) return null;
      return `${content ? `<DOCUMENTATION>\n${content}\n</DOCUMENTATION>\n` : ""}<DB_SCHEMA>\n${JSON.stringify(schemaResponse, null, 2)}\n</DB_SCHEMA>`;
    }
    return null;
  }
}


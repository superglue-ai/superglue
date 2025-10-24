/**
 * PostgreSQL Schema Strategy
 * 
 * Generates database schema documentation for PostgreSQL connections.
 */

import { ApiConfig } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { callPostgres } from '../../execute/postgres.js';
import { logMessage } from "../../utils/logs.js";
import { composeUrl } from "../../utils/tools.js";
import { DocumentationProcessingStrategy } from '../types.js';

export class PostgreSqlStrategy implements DocumentationProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig, metadata: Metadata, credentials?: Record<string, any>): Promise<string | null> {
    if (config.urlHost?.startsWith("postgres://") || config.urlHost?.startsWith("postgresql://")) {
      const connectionUrl = new URL(composeUrl(config.urlHost, config.urlPath));
      connectionUrl.username = credentials?.username || credentials.user || '';
      connectionUrl.password = credentials?.password || credentials.password || '';
      const connectionString = connectionUrl.toString();

      const query = `SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;`;

      const schemaResponse = await callPostgres({ connectionString, query, params: undefined, options: {} });
      logMessage('info', `PostgreSQL Documentation Fetch: Schema retrieved ${schemaResponse.length} rows`, metadata);
      if (!schemaResponse) return null;
      return `${content ? `<DOCUMENTATION>\n${content}\n</DOCUMENTATION>\n` : ""}<DB_SCHEMA>\n${JSON.stringify(schemaResponse, null, 2)}\n</DB_SCHEMA>`;
    }
  }
}
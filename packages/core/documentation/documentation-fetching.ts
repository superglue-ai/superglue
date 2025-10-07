/**
 * Documentation Fetching System
 * 
 * This module provides automated fetching and processing of API documentation from various sources.
 * 
 * PUBLIC FUNCTIONS:
 * 
 * 1. DocumentationFetcher.fetchAndProcess()
 *    - Main entry point for retrieving documentation
 *    - Automatically tries multiple fetching strategies (GraphQL, web crawling, HTTP)
 *    - Processes raw content through multiple processors (OpenAPI, PostgreSQL, HTML-to-Markdown)
 *    - Returns formatted documentation string ready for use
 *    - Caches results to avoid redundant fetches
 * 
 * 2. DocumentationFetcher.fetchOpenApiDocumentation()
 *    - Specialized fetcher for OpenAPI specifications
 *    - Handles JSON and YAML formats
 *    - Can discover and fetch multiple related OpenAPI specs
 *    - Returns consolidated OpenAPI documentation
 * 
 * FETCHING STRATEGIES (tried in order):
 * - GraphQLStrategy: Attempts GraphQL introspection for schema discovery
 * - PlaywrightFetchingStrategy: Uses headless browser to crawl documentation sites
 *   * Tries sitemap-based discovery first for comprehensive coverage
 *   * Falls back to iterative link crawling if sitemap fails
 *   * Filters out non-documentation pages (login, pricing, etc.)
 * - AxiosFetchingStrategy: Simple HTTP GET requests for direct documentation URLs
 * 
 * PROCESSING STRATEGIES (tried in order):
 * - OpenApiStrategy: Extracts and processes OpenAPI/Swagger specifications
 * - PostgreSqlStrategy: Generates database schema documentation for PostgreSQL
 * - HtmlMarkdownStrategy: Converts HTML content to Markdown
 * - RawPageContentStrategy: Returns raw content as final fallback
 */

import { Metadata } from "@superglue/shared";
import axios from "axios";

import { server_defaults } from '../default.js';
import { logMessage } from "../utils/logs.js";
import {
  GraphQLStrategy,
  AxiosFetchingStrategy,
  PlaywrightFetchingStrategy,
  PostgreSqlStrategy,
  OpenApiStrategy,
  HtmlMarkdownStrategy,
  RawPageContentStrategy,
  OpenApiLinkExtractorStrategy,
  DirectOpenApiStrategy,
  SwaggerUIStrategy
} from './strategies/index.js';
import { DocumentationConfig, DocumentationFetchingStrategy, DocumentationProcessingStrategy, OpenApiFetchingStrategy } from './types.js';

export class DocumentationFetcher {
  public config: DocumentationConfig;
  private readonly credentials?: Record<string, any>;
  private readonly metadata: Metadata;

  private lastResult: string | null = null;

  constructor(config: DocumentationConfig, credentials: Record<string, any>, metadata: Metadata) {
    this.config = config;
    this.credentials = credentials;
    this.metadata = metadata;
  }

  public async fetchAndProcess(): Promise<string> {
    if (this.lastResult) {
      return this.lastResult;
    }

    const fetchingStrategies: DocumentationFetchingStrategy[] = [
      new GraphQLStrategy(),
      new PlaywrightFetchingStrategy(),
      new AxiosFetchingStrategy()
    ];

    const processingStrategies: DocumentationProcessingStrategy[] = [
      new OpenApiStrategy(),
      new PostgreSqlStrategy(),
      new HtmlMarkdownStrategy(),
      new RawPageContentStrategy()
    ];

    let rawResult: string | null = null;

    for (const strategy of fetchingStrategies) {
      const result = await strategy.tryFetch(this.config, this.metadata, this.credentials);
      if (result == null || result.length === 0) {
        continue;
      }
      rawResult = result;
      break;
    }

    if (!rawResult) {
      rawResult = "";
    }

    for (const strategy of processingStrategies) {
      const result = await strategy.tryProcess(rawResult, this.config, this.metadata, this.credentials);
      if (result == null || result.length === 0) {
        continue;
      }
      this.lastResult = result;
      return this.lastResult;
    }

    logMessage('warn', "No processing strategy could handle the fetched documentation.", this.metadata);
    return "";
  }

  public async fetchOpenApiDocumentation(): Promise<string> {
    if (!this.config.openApiUrl) {
      return "";
    }

    try {
      const response = await axios.get(this.config.openApiUrl, { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS });
      const data = response.data;

      const strategies: OpenApiFetchingStrategy[] = [
        new DirectOpenApiStrategy(),
        new SwaggerUIStrategy(),
        new OpenApiLinkExtractorStrategy()
      ];

      for (const strategy of strategies) {
        const result = await strategy.tryFetch(data, this.config.openApiUrl, this.metadata);
        if (result) {
          return result;
        }
      }

      return "";
    } catch (error) {
      logMessage('warn', `Failed to fetch OpenAPI documentation from ${this.config.openApiUrl}: ${error?.message}`, this.metadata);
      return "";
    }
  }
}

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
 *    - Processes raw content through multiple processors (PostgreSQL, HTML-to-Markdown, raw content)
 *    - Returns formatted documentation string ready for use
 *    - Caches results to avoid redundant fetches
 *
 * 2. DocumentationFetcher.fetchOpenApiDocumentation()
 *    - Specialized fetcher for OpenAPI specifications
 *    - Handles JSON and YAML formats
 *    - Can discover and fetch multiple related OpenAPI specs from various sources
 *    - Returns consolidated OpenAPI documentation
 *
 * FETCHING STRATEGIES (tried in order):
 * - GraphQLStrategy: Attempts GraphQL introspection queries for schema discovery
 * - PlaywrightFetchingStrategy: Uses headless browser to crawl documentation sites
 *   * Tries sitemap-based discovery first for comprehensive coverage
 *   * Ranks URLs by keywords to prioritize relevant documentation
 *   * Falls back to iterative link crawling if sitemap fails or times out
 *   * Filters out non-documentation pages (login, pricing, localized versions, etc.)
 * - AxiosFetchingStrategy: Simple HTTP GET requests for direct documentation URLs
 *
 * PROCESSING STRATEGIES (tried in order):
 * - PostgreSqlStrategy: Queries information_schema to generate database schema documentation
 * - HtmlMarkdownStrategy: Converts HTML content to Markdown using a shared conversion pool
 * - RawPageContentStrategy: Returns raw content as final fallback (always succeeds)
 *
 * OPENAPI FETCHING STRATEGIES (tried in order):
 * - DirectOpenApiStrategy: Directly parses JSON/YAML to validate and extract OpenAPI specs
 * - SwaggerUIStrategy: Detects SwaggerUI pages and extracts actual spec URLs via static analysis or Playwright
 * - HtmlLinkExtractorStrategy: Searches raw HTML from previous fetches for OpenAPI spec URLs
 * - OpenApiLinkExtractorStrategy: Extracts OpenAPI URLs from JSON/YAML objects containing spec links
 */

import { Metadata } from "@superglue/shared";
import axios from "axios";

import { server_defaults } from "../default.js";
import { logMessage } from "../utils/logs.js";
import {
  GraphQLStrategy,
  AxiosFetchingStrategy,
  PlaywrightFetchingStrategy,
  PostgreSqlStrategy,
  HtmlMarkdownStrategy,
  RawPageContentStrategy,
  OpenApiLinkExtractorStrategy,
  DirectOpenApiStrategy,
  SwaggerUIStrategy,
  HtmlLinkExtractorStrategy,
} from "./strategies/index.js";
import {
  DocumentationConfig,
  DocumentationFetchingStrategy,
  DocumentationProcessingStrategy,
  OpenApiFetchingStrategy,
} from "./types.js";

export class DocumentationFetcher {
  public config: DocumentationConfig;
  private readonly credentials?: Record<string, any>;
  private readonly metadata: Metadata;

  private lastFetchAndProcessResult: string | null = null;
  private lastFetchAndProcessRawResult: string | null = null;

  constructor(
    config: DocumentationConfig,
    credentials: Record<string, any>,
    metadata: Metadata,
  ) {
    this.config = config;
    this.credentials = credentials;
    this.metadata = metadata;
  }

  public async fetchAndProcess(): Promise<string> {
    if (this.lastFetchAndProcessResult) {
      return this.lastFetchAndProcessResult;
    }

    const fetchingStrategies: DocumentationFetchingStrategy[] = [
      new GraphQLStrategy(),
      new PlaywrightFetchingStrategy(),
      new AxiosFetchingStrategy(),
    ];

    const processingStrategies: DocumentationProcessingStrategy[] = [
      new PostgreSqlStrategy(),
      new HtmlMarkdownStrategy(),
      new RawPageContentStrategy(),
    ];

    let rawResult: string | null = null;

    for (const strategy of fetchingStrategies) {
      const result = await strategy.tryFetch(
        this.config,
        this.metadata,
        this.credentials,
      );
      if (result == null || result.length === 0) {
        continue;
      }
      rawResult = result;
      break;
    }

    if (!rawResult) {
      rawResult = "";
    }

    this.lastFetchAndProcessRawResult = rawResult;

    for (const strategy of processingStrategies) {
      const result = await strategy.tryProcess(
        rawResult,
        this.config,
        this.metadata,
        this.credentials,
      );
      if (result == null || result.length === 0) {
        continue;
      }
      this.lastFetchAndProcessResult = result;
      return this.lastFetchAndProcessResult;
    }

    logMessage(
      "warn",
      "No processing strategy could handle the fetched documentation.",
      this.metadata,
    );
    return "";
  }

  public async fetchOpenApiDocumentation(): Promise<string> {
    if (!this.config.openApiUrl) {
      return "";
    }

    try {
      const response = await axios.get(this.config.openApiUrl, {
        timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS,
      });
      const data = response.data;

      const strategies: OpenApiFetchingStrategy[] = [
        new DirectOpenApiStrategy(),
        new SwaggerUIStrategy(),
        new HtmlLinkExtractorStrategy(this.lastFetchAndProcessRawResult),
        new OpenApiLinkExtractorStrategy(),
      ];

      for (const strategy of strategies) {
        const result = await strategy.tryFetch(
          data,
          this.config.openApiUrl,
          this.metadata,
        );
        if (result) {
          return result;
        }
      }

      return "";
    } catch (error) {
      logMessage(
        "warn",
        `Failed to fetch OpenAPI documentation from ${this.config.openApiUrl}: ${error?.message}`,
        this.metadata,
      );
      return "";
    }
  }
}

/**
 * Shared types for documentation fetching and processing strategies
 */

import { Metadata } from "@superglue/shared";

export interface DocumentationConfig {
  urlHost?: string;
  instruction?: string;
  documentationUrl?: string;
  openApiUrl?: string;
  urlPath?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  keywords?: string[];
}

export interface DocumentationFetchingStrategy {
  tryFetch(
    config: DocumentationConfig,
    metadata: Metadata,
    credentials?: Record<string, any>,
  ): Promise<string | null>;
}

export interface DocumentationProcessingStrategy {
  tryProcess(
    rawResult: string,
    config: DocumentationConfig,
    metadata: Metadata,
    credentials?: Record<string, any>,
  ): Promise<string | null>;
}

export interface OpenApiFetchingStrategy {
  tryFetch(
    responseData: any,
    openApiUrl: string,
    metadata: Metadata,
  ): Promise<string | null>;
}

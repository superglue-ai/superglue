/**
 * Documentation Module
 * 
 * This module provides comprehensive documentation fetching, processing, and retrieval capabilities.
 */

export { DocumentationFetcher } from './documentation-fetching.js';
export { AxiosFetchingStrategy, PlaywrightFetchingStrategy } from './strategies/index.js';
export { DocumentationSearch } from './documentation-search.js';
export { 
  removeOldVersionFromUrls, 
  extractOpenApiUrlsFromObject, 
  fetchMultipleOpenApiSpecs, 
  filterDocumentationUrls, 
  extractOpenApiUrlFromHtml 
} from './documentation-utils.js';
export type { DocumentationConfig, DocumentationFetchingStrategy, DocumentationProcessingStrategy } from './types.js';

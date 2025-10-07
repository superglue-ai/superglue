/**
 * Documentation Module
 * 
 * This module provides comprehensive documentation fetching, processing, and retrieval capabilities.
 */

export { DocumentationFetcher } from './documentation-fetching.js';
export { AxiosFetchingStrategy, PlaywrightFetchingStrategy } from './strategies/index.js';
export { DocumentationRetrieval } from './documentation-retrieval.js';
export { 
  removeOldVersionFromUrls, 
  extractOpenApiUrlsFromObject, 
  fetchMultipleOpenApiSpecs, 
  filterDocumentationUrls, 
  extractOpenApiUrlFromHtml 
} from './documentation-utils.js';
export { DocumentationConfig, DocumentationFetchingStrategy, DocumentationProcessingStrategy } from './types.js';

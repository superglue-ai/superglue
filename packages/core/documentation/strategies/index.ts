/**
 * Documentation Strategies
 * 
 * Fetching and processing strategies for documentation retrieval.
 */

// Fetching Strategies
export { GraphQLStrategy } from './fetching-graphql.js';
export { AxiosFetchingStrategy } from './fetching-axios.js';
export { PlaywrightFetchingStrategy } from './fetching-playwright.js';

// Processing Strategies
export { PostgreSqlStrategy } from './processing-postgresql.js';
export { OpenApiStrategy } from './processing-openapi.js';
export { HtmlMarkdownStrategy } from './processing-html-markdown.js';
export { RawPageContentStrategy } from './processing-raw-content.js';

// OpenAPI Fetching Strategies
export { OpenApiLinkExtractorStrategy } from './openapi-link-extractor.js';
export { DirectOpenApiStrategy } from './openapi-direct.js';


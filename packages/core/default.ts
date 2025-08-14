// This file contains the internal configuration for the server

export const server_defaults = {
    posthog: {
        // this is the public key for the posthog project. This can be public, this is not a secret.
        apiKey: 'phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE',
        host: 'https://d22ze2hfwgrlye.cloudfront.net',
    },
    MAX_CALL_RETRIES: 10,
    MAX_TRANSFORMATION_RETRIES: 10,
    DEFAULT_LOOP_MAX_ITERS: 1000,
    MAX_PAGINATION_REQUESTS: 1000,
    DOCUMENTATION_MIN_SEARCH_TERM_LENGTH: 4,
    DOCUMENTATION: {
        MAX_LENGTH_OFFSET: 50000,
        MAX_LENGTH_ABSOLUTE: 200000,
        MAX_FETCHED_LINKS: 25,
        PARALLEL_FETCH_LIMIT: 25,
        MAX_SITEMAP_DEPTH: 3,
        MAX_CONCURRENT_OPENAPI_FETCHES: 25,
        MAX_OPENAPI_SPECS_TO_FETCH: 100,
        TEXT_PATTERN_REMOVAL_MAX_LENGTH: 400,
        FUSE_THRESHOLD: 0.2, // 0.0 = exact match, 1.0 = match anything
        FUSE_MIN_MATCH_LENGTH: 3, // Minimum characters to match
        MAX_CONCURRENT_CONTEXTS: 10, // Max concurrent Playwright browser contexts
        MAX_PAGE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB hard cap per page
        MAX_CODE_BLOCKS_PER_PAGE: 50,
        MAX_TABLE_ROWS_TOTAL: 5000,
        MAX_CONTENT_SIZE_FOR_CONVERSION: 5 * 1024 * 1024, // 5MB max for HTML to Markdown conversion
        TIMEOUTS: {
            AXIOS: 120000,
            PLAYWRIGHT: 120000,
            EVAL_DOC_PROCESSING_TIMEOUT: 1200000,
            SITEMAP_FETCH: 60000,
            SITEMAP_PROCESSING_TOTAL: 120000
        }
    },
    POSTGRES: {
        POOL_IDLE_TIMEOUT: 5 * 60 * 1000, // 5 minutes
        POOL_CLEANUP_INTERVAL: 60 * 1000, // 1 minute
        DEFAULT_TIMEOUT: 30000, // 30 seconds
        DEFAULT_RETRIES: 0,
        DEFAULT_RETRY_DELAY: 1000, // 1 second
    },
    FTP: {
        DEFAULT_TIMEOUT: 30000, // 30 seconds
        DEFAULT_RETRIES: 0,
        DEFAULT_RETRY_DELAY: 1000, // 1 second
    }
}
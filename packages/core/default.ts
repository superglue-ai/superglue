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
    AXIOS: {
        MAX_QUICK_RETRIES: 2,
        QUICK_RETRY_THRESHOLD_MS: 10000,
        DEFAULT_RETRY_DELAY_MS: 1000,
        MAX_RATE_LIMIT_WAIT_MS: 60 * 60 * 1000 * 24, // 24 hours is the max wait time for rate limit retries, hardcoded
        REJECT_UNAUTHORIZED: false,
        KEEP_ALIVE: false,
    },
    CONTEXT: {
        JSON_PREVIEW_DEPTH_LIMIT: 5,
        JSON_PREVIEW_ARRAY_LIMIT: 5,
        JSON_PREVIEW_OBJECT_KEY_LIMIT: 1000,
        JSON_SAMPLES_MAX_ARRAY_PATHS: 10,
        JSON_SAMPLES_ITEMS_PER_ARRAY: 5,
        JSON_SAMPLE_OBJECT_MAX_DEPTH: 5,
        INTEGRATIONS: {
            AUTH_MAX_SECTIONS: 3,
            AUTH_SECTION_SIZE_CHARS: 2000,
            PAGINATION_MAX_SECTIONS: 3,
            PAGINATION_SECTION_SIZE_CHARS: 2000,
            GENERAL_MAX_SECTIONS: 20,
            GENERAL_SECTION_SIZE_CHARS: 2000
        }
    },
    DOCUMENTATION: {
        MIN_SEARCH_TERM_LENGTH: 4,
        MAX_LENGTH_OFFSET: 50000,
        MAX_LENGTH_ABSOLUTE: 200000,
        MAX_FETCHED_LINKS: 20,
        MAX_PAGES_TO_FETCH_IN_PARALLEL: 4,
        MAX_SITEMAP_DEPTH: 3,
        MAX_SITEMAPS_PER_DEPTH: 10, // Limit per depth level to prevent explosion at any single level
        MAX_TOTAL_SITEMAPS: 25, // Global limit across all depths to bound total processing
        MAX_CONCURRENT_OPENAPI_FETCHES: 25,
        MAX_OPENAPI_SPECS_TO_FETCH: 100,
        MAX_PAGE_SIZE_BYTES: 3 * 1024 * 1024, // 3MB hard cap per individual page after pruning
        MAX_TOTAL_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB total budget for all pages combined
        SIMILARITY_THRESHOLD_PERCENTAGE: 90, // 90% similarity threshold for deduplication
        TIMEOUTS: {
            AXIOS: 120000,
            PLAYWRIGHT: 120000,
            EVAL_DOC_PROCESSING_TIMEOUT: 1200000,
            SITEMAP_FETCH: 60000,
            SITEMAP_PROCESSING_TOTAL: 120000
        }
    },
    HTML_MARKDOWN_POOL: {
        MAX_WORKERS: 16,
        TASK_TIMEOUT: 240000, // 240 seconds for HTML to Markdown conversion (handles up to 10MB)
        MAX_QUEUE_SIZE: 200
    },
    POSTGRES: {
        POOL_IDLE_TIMEOUT: 5 * 60 * 1000, // 5 minutes
        POOL_CLEANUP_INTERVAL: 60 * 1000, // 1 minute
        DEFAULT_TIMEOUT: 30000, // 30 seconds
        DEFAULT_RETRIES: 0,
        DEFAULT_RETRY_DELAY: 1000, // 1 second
        OAUTH_SECRET_TTL_MS: 5 * 60 * 1000, // 5 minutes
    },
    FTP: {
        DEFAULT_TIMEOUT: 30000, // 30 seconds
        DEFAULT_RETRIES: 0,
        DEFAULT_RETRY_DELAY: 1000, // 1 second
    },
    LLM: {
        REQUEST_TIMEOUT_MS: 120000, // 120 seconds per LLM API request
        MAX_INTERNAL_RETRIES: 0,
    }
}
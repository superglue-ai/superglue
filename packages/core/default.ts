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
    TIMEOUTS: {
        AXIOS: 120000,
        PLAYWRIGHT: 120000,
        EVAL_DOC_PROCESSING_TIMEOUT: 1200000,
        SITEMAP_FETCH: 60000,
        SITEMAP_PROCESSING_TOTAL: 120000
    },
    DOCUMENTATION: {
        MAX_LENGTH_OFFSET: 50000,
        MAX_LENGTH_ABSOLUTE: 200000,
        MAX_FETCHED_LINKS: 25,
        PARALLEL_FETCH_LIMIT: 25,
        MAX_SITEMAP_DEPTH: 3,
        MAX_CONCURRENT_OPENAPI_FETCHES: 25,
        MAX_OPENAPI_SPECS_TO_FETCH: 100,
        TEXT_PATTERN_REMOVAL_MAX_LENGTH: 400
    }
}
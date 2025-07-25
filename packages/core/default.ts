// This file contains the internal configuration for the server

export const server_defaults = {
    posthog: {
        // this is the public key for the posthog project. This can be public, this is not a secret.
        apiKey: 'phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE',
        host: 'https://d22ze2hfwgrlye.cloudfront.net',
    },
    MAX_CALL_RETRIES: 10,
    MAX_TRANSFORMATION_RETRIES: 10,
    DEFAULT_LOOP_MAX_ITERS: 100,
    MAX_PAGINATION_REQUESTS: 1000,
    DOCUMENTATION_MIN_SEARCH_TERM_LENGTH: 4,
    TIMEOUTS: {
        AXIOS: 60000,
        PLAYWRIGHT: 60000,
        EVAL_DOC_PROCESSING_TIMEOUT: 1200000
    }
    
}
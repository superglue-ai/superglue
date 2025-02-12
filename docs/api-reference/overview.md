---
title: 'Overview'
description: 'Overview of the superglue GraphQL API'
---

The Core API provides GraphQL endpoints for managing API configurations, data extraction, and transformations. The API is built around three main concepts:

* **API Calls**

  : Execute and transform API requests

* **Extractions**

  : Process and parse files/responses

* **Transformations**

  : Convert data between formats

## Endpoint

You can call the superglue GraphQL API via <code>https://graphql.superglue.cloud</code> or by not specifying an endpoint in the SDK. For the self-hosted version, the default port for the GraphQL interface is 3000.

```http
Authorization: Bearer YOUR_AUTH_TOKEN
```

## Authentication

All requests require authentication using a bearer token:

```http
Authorization: Bearer YOUR_AUTH_TOKEN
```

## Base Types

All configuration types inherit from `BaseConfig`:

```graphql
interface BaseConfig {
  id: ID!                 # Unique identifier
  version: String        # Configuration version
  createdAt: DateTime    # Creation timestamp
  updatedAt: DateTime    # Last update timestamp
}
```

## Common Parameters

### Request Options

All execution operations (`call`, `extract`, `transform`) accept an options object:

```graphql
input RequestOptions {
  webhookUrl: String     # URL for async completion notifications
  cacheMode: CacheMode   # Cache behavior (see below)
  timeout: Int          # Request timeout in milliseconds
  retries: Int         # Number of retry attempts (max 8 for calls, 5 for extracts)
  retryDelay: Int      # Delay between retries in milliseconds
}
```

### Cache Modes

The `cacheMode` parameter controls caching behavior:

* `ENABLED`

  \- Read and write to cache (default)

* `DISABLED`

  \- No caching (Note: ID lookups require cache)

* `READONLY`

  \- Only read from cache

* `WRITEONLY`

  \- Only write to cache

### Pagination

List operations support pagination parameters:

* `limit`

  (Int, default: 10): Number of items to return

* `offset`

  (Int, default: 0): Number of items to skip

## Error Handling

All operations return a consistent error format:

```graphql
{
  success: Boolean!      # Operation success status
  error: String         # Error message if failed
  startedAt: DateTime!  # Operation start time
  completedAt: DateTime! # Operation completion time
}
```

### Retry Logic

* API calls automatically retry up to 8 times on failure

* Extractions retry up to 5 times

* Each retry attempt can generate a new configuration based on the previous error

## Webhooks

When a `webhookUrl` is provided in the options:

* Success:

  `POST`

  request with

  `{success: true, data: result}`

* Failure:

  `POST`

  request with

  `{success: false, error: message}`

See also:

* [Types Reference](types)

  for detailed type definitions

* [Queries](queries)

  for available queries

* [Mutations](mutations)

  for available mutations
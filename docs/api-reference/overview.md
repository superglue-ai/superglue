---
title: 'Overview'
description: 'Overview of the superglue GraphQL API'
---

The Core API provides GraphQL endpoints for managing workflows and integrations. Main concepts:

* **Workflows**: Chain multiple steps into a single execution
* **Integrations**: Manage integrations (e.g. Stripe, Hubspot) and their credentials

## Endpoint

Use [`https://graphql.superglue.cloud`](https://graphql.superglue.cloud) or omit endpoint in the SDK. Self-hosted default port: 3000.

## Authentication

All requests require a bearer token:

```http
Authorization: Bearer YOUR_AUTH_TOKEN
```

## Base Types

```graphql
interface BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
}

union ConfigType = Workflow
```

## Input Types

### WorkflowInput
- id: String!
- steps: [ExecutionStepInput!]
- integrationIds: [ID!]
- finalTransform: JSONata
- inputSchema: JSONSchema
- responseSchema: JSONSchema
- version: String
- instruction: String

### IntegrationInput
- id: ID!
- name: String
- urlHost: String
- urlPath: String
- credentials: JSON
- documentationUrl: String
- documentation: String
- documentationPending: Boolean (default: false)
- specificInstructions: String

### RequestOptions

Control how operations are executed with fine-grained options.

```json
{
  "selfHealing": "ENABLED",     // Default: ENABLED
  "cacheMode": "READONLY",       // Deprecated, Default: READONLY
  "timeout": 300000,             // Default: 300000ms (5 minutes)
  "retries": 10,                 // Default: 10 attempts
  "retryDelay": 0,           // Default: 0ms (no delay)
  "webhookUrl": null,           // Default: null (no webhooks)
  "testMode": false             // Default: false - if this is true, superglue will validate the request after each execution. This is useful for building, testing and debugging.
}
```

**Field Explanations:**
- `selfHealing`: If it should auto-fix issues
  - `ENABLED`: Full auto-healing (recommended)
  - `TRANSFORM_ONLY`: Only fix data transformation issues
  - `REQUEST_ONLY`: Only fix API request issues  
  - `DISABLED`: No auto-healing
- `cacheMode`: Deprecated - If it should use the saved configuration and update it if self-healing is performed. this only works for calls, not for workflows.
  - `ENABLED`: Cache reads and writes
  - `READONLY`: Only read from cache, don't write (Default)
  - `WRITEONLY`: Only write to cache, don't read
  - `DISABLED`: No caching
- `timeout`: Maximum time to wait (milliseconds)
- `retries`: Number of retry attempts on failure
- `retryDelay`: Delay between retries (milliseconds)
- `webhookUrl`: POST endpoint for async notifications - this only works for calls, not for workflows.
- `testMode`: If true, validate each request after execution. This is useful for building, testing and debugging.

### PaginationInput
- type: PaginationType!
- pageSize: String (default: "50")
- cursorPath: String
- stopCondition: String

### SystemInput
- id: String!
- urlHost: String!
- urlPath: String
- documentationUrl: String
- documentation: String
- credentials: JSON

## Enums

### HttpMethod
GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS

### CacheMode
ENABLED, READONLY, WRITEONLY, DISABLED

### FileType
CSV, JSON, XML, AUTO

### AuthType
NONE, OAUTH2, HEADER, QUERY_PARAM

### DecompressionMethod
GZIP, DEFLATE, NONE, AUTO, ZIP

### PaginationType
OFFSET_BASED, PAGE_BASED, CURSOR_BASED, DISABLED

### LogLevel
DEBUG, INFO, WARN, ERROR

### SelfHealingMode
ENABLED, TRANSFORM_ONLY, REQUEST_ONLY, DISABLED

### UpsertMode
CREATE, UPDATE, UPSERT

## Common Parameters

All execution operations (`executeWorkflow`) accept a `RequestOptions` object.

### Default Query Parameters

Most list operations support:
- `limit: Int` (default: 50)
- `offset: Int` (default: 0)

## Error Handling

All operations return:

```graphql
{
  success: Boolean!
  error: String
  startedAt: DateTime!
  completedAt: DateTime!
}
```

## Retry Logic

- API calls: up to 8 retries
- Extractions: up to 5 retries
- Each retry can generate a new config based on the previous error

## Webhooks

If `webhookUrl` is set in options:
- On success: POST `{success: true, data: result}`
- On failure: POST `{success: false, error: message}`

## Workflows

Workflows let you chain multiple steps into a single execution. Each step can run in DIRECT mode or LOOP mode for batch processing.

## Integrations

Integrations manage connections to third-party services, storing credentials and configuration needed for API calls.

See also:
- [Types Reference](types.md)
- [Queries](queries.md)
- [Mutations](mutations.md)
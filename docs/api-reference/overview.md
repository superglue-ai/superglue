---
title: 'Overview'
description: 'Overview of the superglue GraphQL API'
---

The Core API provides GraphQL endpoints for managing API configurations, data extraction, transformations, and workflows. Main concepts:

* **API Calls**: Execute and transform API requests
* **Extractions**: Process and parse files/responses
* **Transformations**: Convert data between formats
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

union ConfigType = ApiConfig | ExtractConfig | TransformConfig | Workflow
```

## Input Types

### ApiInput
- id: ID!
- urlHost: String!
- urlPath: String
- instruction: String!
- queryParams: JSON
- method: HttpMethod
- headers: JSON
- body: String
- documentationUrl: String
- responseSchema: JSONSchema
- responseMapping: JSONata
- authentication: AuthType
- pagination: PaginationInput
- dataPath: String
- version: String

### ExtractInput
- id: ID!
- urlHost: String!
- urlPath: String
- queryParams: JSON
- instruction: String!
- method: HttpMethod
- headers: JSON
- body: String
- documentationUrl: String
- decompressionMethod: DecompressionMethod
- fileType: FileType
- authentication: AuthType
- dataPath: String
- version: String

### TransformInput
- id: ID!
- instruction: String!
- responseSchema: JSONSchema!
- responseMapping: JSONata
- version: String

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
- documentationPending: Boolean

### RequestOptions
- selfHealing: SelfHealingMode
- cacheMode: CacheMode
- timeout: Int
- retries: Int
- retryDelay: Int
- webhookUrl: String

### PaginationInput
- type: PaginationType!
- pageSize: String
- cursorPath: String

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

All execution operations (`call`, `extract`, `transform`, `executeWorkflow`) accept a `RequestOptions` object.

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

Workflows let you chain multiple steps (API, extract, transform) into a single execution. Each step can run in DIRECT mode or LOOP mode for batch processing.

## Integrations

Integrations manage connections to third-party services, storing credentials and configuration needed for API calls.

See also:
- [Types Reference](types.md)
- [Queries](queries.md)
- [Mutations](mutations.md)
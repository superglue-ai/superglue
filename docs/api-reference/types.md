## Types Reference

### Base Types

```graphql
interface BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
}

union ConfigType = ApiConfig | ExtractConfig | TransformConfig | Workflow
```

### ApiConfig

Configuration for API endpoints. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type ApiConfig implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  urlHost: String                   # Base URL for the API
  urlPath: String                   # Path component of the URL
  method: HttpMethod                # HTTP method to use
  headers: JSON                     # Request headers
  queryParams: JSON                 # URL query parameters
  body: String                      # Request body
  instruction: String               # Natural language description of the transformation
  authentication: AuthType          # Authentication method
  responseSchema: JSONSchema        # Expected response format
  responseMapping: JSONata         # JSONata transformation expression
  pagination: Pagination           # Pagination configuration
  dataPath: String                 # Path to data in response
  documentationUrl: String
}
```

### ExtractConfig

Configuration for data extraction. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type ExtractConfig implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  urlHost: String                   # Source URL or file location
  urlPath: String                   # Path component of the URL
  method: HttpMethod                # HTTP method for API sources
  headers: JSON                     # Request headers
  queryParams: JSON                 # URL query parameters
  body: String                      # Request body
  instruction: String               # Natural language description
  authentication: AuthType          # Authentication method
  fileType: FileType                # Format of the source file
  decompressionMethod: DecompressionMethod  # Decompression algorithm
  dataPath: String                  # Path to data in file/response
  documentationUrl: String
}
```

### TransformConfig

Configuration for data transformation. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type TransformConfig implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  instruction: String               # Natural language description
  responseSchema: JSONSchema        # Target data format
  responseMapping: JSONata         # Transformation expression
}
```

### Workflow

Configuration for multi-step workflows. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type Workflow implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  steps: [ExecutionStep!]           # Workflow execution steps
  instruction: String               # Natural language description
  finalTransform: JSONata           # Final data transformation
  responseSchema: JSONSchema        # Expected final output format
  inputSchema: JSONSchema           # Expected input format
}
```

### ExecutionStep

Individual step within a workflow.

```graphql
type ExecutionStep {
  id: String!
  apiConfig: ApiConfig!
  integrationId: ID                 # Integration to use for this step
  executionMode: String             # DIRECT | LOOP
  loopSelector: JSONata             # JSONata expression for loop iteration
  loopMaxIters: Int                 # Maximum loop iterations
  inputMapping: JSONata             # Input data transformation
  responseMapping: JSONata          # Response data transformation
}
```

### Integration

Third-party service integration configuration.

```graphql
type Integration {
  id: ID!
  name: String                      # Human-readable name
  type: String                      # Integration type
  urlHost: String                   # Base host URL
  urlPath: String                   # Default path
  credentials: JSON                 # Stored credentials
  documentationUrl: String          # Link to API documentation
  documentation: String             # Documentation content
  documentationPending: Boolean     # Whether documentation is being processed
  icon: String                      # Icon URL
  version: String                   # Integration version
  createdAt: DateTime
  updatedAt: DateTime
}
```

### TenantInfo

Tenant account information.

```graphql
type TenantInfo {
  email: String                     # Tenant email
  emailEntrySkipped: Boolean!       # Whether email entry was skipped
}
```

### WorkflowResult

Result of workflow execution.

```graphql
type WorkflowResult {
  id: ID!
  success: Boolean!
  data: JSON
  error: String
  startedAt: DateTime!
  completedAt: DateTime!
  config: Workflow
  stepResults: [WorkflowStepResult!]
}
```

### WorkflowStepResult

Result of individual workflow step execution.

```graphql
type WorkflowStepResult {
  stepId: String!
  success: Boolean!
  rawData: JSON
  transformedData: JSON
  error: String
}
```

### RunResult

Result of individual operation execution.

```graphql
type RunResult {
  id: ID!
  success: Boolean!
  data: JSON
  error: String
  startedAt: DateTime!
  completedAt: DateTime!
  config: ConfigType
}
```

### Log

Log entry for operation tracking.

```graphql
type Log {
  id: ID!
  message: String!
  level: LogLevel!
  timestamp: DateTime!
  runId: ID
}
```

### Pagination

```graphql
type Pagination {
  type: PaginationType!
  pageSize: String
  cursorPath: String
}
```

## List Types

### RunList
```graphql
type RunList {
  items: [RunResult!]!
  total: Int!
}
```

### ApiList
```graphql
type ApiList {
  items: [ApiConfig!]!
  total: Int!
}
```

### TransformList
```graphql
type TransformList {
  items: [TransformConfig!]!
  total: Int!
}
```

### ExtractList
```graphql
type ExtractList {
  items: [ExtractConfig!]!
  total: Int!
}
```

### WorkflowList
```graphql
type WorkflowList {
  items: [Workflow!]!
  total: Int!
}
```

### IntegrationList
```graphql
type IntegrationList {
  items: [Integration!]!
  total: Int!
}
```

## Enums

### HttpMethod

Available HTTP methods:

- `GET`
- `POST`
- `PUT`
- `DELETE`
- `PATCH`
- `HEAD`
- `OPTIONS`

### AuthType

Authentication methods:

- `NONE` - No authentication
- `HEADER` - Authentication via headers
- `QUERY_PARAM` - Authentication via query parameters
- `OAUTH2` - OAuth 2.0 authentication

### FileType

Supported file formats:

- `AUTO` - Automatic detection
- `JSON` - JSON files
- `CSV` - CSV files
- `XML` - XML files

### DecompressionMethod

Available decompression methods:

- `NONE` - No decompression
- `GZIP` - gzip compression
- `DEFLATE` - deflate compression
- `ZIP` - zip archives
- `AUTO` - Automatic detection

### CacheMode

Cache behavior options:

- `ENABLED` - Full caching
- `DISABLED` - No caching
- `READONLY` - Read-only cache. This is the default mode.
- `WRITEONLY` - Write-only cache

### PaginationType

Pagination type options:

- `OFFSET_BASED` - Offset-based pagination
- `PAGE_BASED` - Page-based pagination
- `CURSOR_BASED` - Cursor-based pagination
- `DISABLED` - Disabled pagination

### LogLevel

Log level options:

- `DEBUG` - Debug level
- `INFO` - Info level
- `WARN` - Warn level
- `ERROR` - Error level

### SelfHealingMode

Self-healing behavior options:

- `ENABLED` - Full self-healing
- `TRANSFORM_ONLY` - Transform-only self-healing
- `REQUEST_ONLY` - Request-only self-healing
- `DISABLED` - No self-healing

### UpsertMode

Upsert operation modes:

- `CREATE` - Create only
- `UPDATE` - Update only
- `UPSERT` - Create or update

## Subscriptions

### Logs

Stream log messages in real time.

```graphql
subscription {
  logs {
    id
    message
    level
    timestamp
    runId
  }
}
```

- `id`: ID of the log message
- `message`: Log message string
- `level`: LogLevel (DEBUG, INFO, WARN, ERROR)
- `timestamp`: DateTime
- `runId`: ID of the related run (optional)

See also:

- [Overview](overview.md) for common parameters
- [Mutations](mutations.md) for operations using these types
- [Queries](queries.md) for retrieving configurations
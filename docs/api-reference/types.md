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
  
  urlHost: String                   # Base URL for the API (e.g., "https://api.stripe.com")
  urlPath: String                   # Path component of the URL (e.g., "/v1/customers")
  method: HttpMethod                # HTTP method to use (default: GET)
  headers: JSON                     # Request headers (default: {})
  queryParams: JSON                 # URL query parameters (default: {})
  body: String                      # Request body for POST/PUT/PATCH requests
  instruction: String               # Natural language description of what this API does
  authentication: AuthType          # Authentication method (default: NONE)
  responseSchema: JSONSchema        # Expected response format (auto-generated if not provided)
  responseMapping: JSONata         # JSONata transformation expression (optional)
  pagination: Pagination           # Pagination configuration (default: DISABLED)
  dataPath: String                 # JSONPath to extract data from response (e.g., "$.data")
  documentationUrl: String         # URL to API documentation for auto-configuration
}
```

### ExtractConfig

Configuration for data extraction from files or APIs. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type ExtractConfig implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  urlHost: String                   # Source URL or file location (e.g., "https://api.example.com" or "s3://bucket")
  urlPath: String                   # Path component of the URL or file path
  method: HttpMethod                # HTTP method for API sources (default: GET)
  headers: JSON                     # Request headers for API sources (default: {})
  queryParams: JSON                 # URL query parameters for API sources (default: {})
  body: String                      # Request body for API sources
  instruction: String               # Natural language description of what to extract
  authentication: AuthType          # Authentication method for API sources (default: NONE)
  fileType: FileType                # Format of the source file (default: AUTO)
  decompressionMethod: DecompressionMethod  # Decompression algorithm (default: AUTO)
  dataPath: String                  # JSONPath to extract specific data (e.g., "$.records")
  documentationUrl: String         # URL to API/file format documentation
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
  
  instruction: String               # Natural language description of desired transformation
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
  integrationIds: [ID]              # Integration IDs used in workflow
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
  credentials: JSON                 # Stored credentials (encrypted at rest)
  documentationUrl: String          # Link to API documentation
  documentation: String             # Documentation content
  documentationPending: Boolean     # Whether documentation is being processed
  icon: String                      # Icon URL
  version: String                   # Integration version
  createdAt: DateTime
  updatedAt: DateTime
}
```

### SuggestedIntegration

AI-suggested integration based on natural language search terms.

```graphql
type SuggestedIntegration {
  integration: Integration!         # Full integration object
  reason: String!                   # Why this integration is relevant
}
```

### SuggestedTool

AI-suggested tool (workflow) based on natural language search terms.

```graphql
type ToolStep {
  integrationId: String             # Integration used in this step
  instruction: String               # Step-level instruction
}

type SuggestedTool {
  id: ID!                           # Tool identifier
  instruction: String               # What the tool does
  steps: [ToolStep!]!               # Steps and integrations used
  reason: String!                   # Why this tool matches the search
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

Configuration for automatic pagination handling.

```graphql
type Pagination {
  type: PaginationType!             # Pagination strategy (OFFSET_BASED, PAGE_BASED, CURSOR_BASED, DISABLED)
  pageSize: String                  # Number of items per page (default: "100")
  cursorPath: String                # JSONPath to cursor field for cursor-based pagination (e.g., "$.next_cursor")
  stopCondition: String             # Condition to stop pagination (optional)
}
```

**Pagination Types:**
- `OFFSET_BASED`: Uses offset/limit parameters
- `PAGE_BASED`: Uses page number and page size
- `CURSOR_BASED`: Uses cursor tokens for navigation
- `DISABLED`: No automatic pagination (default)

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

### WorkflowResult

Result of workflow execution with detailed step results.

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

- `stepResults`: Array of individual step results within the workflow

### WorkflowStepResult

Result of an individual step within a workflow execution.

```graphql
type WorkflowStepResult {
  stepId: String!
  success: Boolean!
  rawData: JSON
  transformedData: JSON
  error: String
}
```

- `stepId`: Identifier of the step within the workflow
- `rawData`: Raw response data before transformation
- `transformedData`: Data after applying transformations

### ExecutionStep

Configuration for a single step within a workflow.

```graphql
type ExecutionStep {
  id: String!
  apiConfig: ApiConfig!
  integrationId: ID
  executionMode: String     # DIRECT | LOOP
  loopSelector: JSONata
  loopMaxIters: Int
  inputMapping: JSONata
  responseMapping: JSONata
}
```

- `executionMode`: How to execute the step (DIRECT for single execution, LOOP for batch processing)
- `loopSelector`: JSONata expression to select items for looping
- `loopMaxIters`: Maximum iterations for loop mode (default: 1000)
- `inputMapping`: JSONata expression to map workflow data to step input
- `responseMapping`: JSONata expression to transform step output

### SuggestedIntegration

Suggested integration returned by `findRelevantIntegrations` query.

```graphql
type SuggestedIntegration {
  id: String!
  reason: String!
  savedCredentials: [String!]!
}
```

- `reason`: Explanation of why this integration was suggested
- `savedCredentials`: Names of credentials already saved for this integration

 See also:

- [Overview](overview.md) for common parameters
- [Mutations](mutations.md) for operations using these types
- [Queries](queries.md) for retrieving configurations
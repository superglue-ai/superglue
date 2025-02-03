# Types Reference

## ApiConfig
Configuration for API endpoints. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type ApiConfig implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  urlHost: String!                  # Base URL for the API
  urlPath: String                   # Path component of the URL
  method: HttpMethod!               # HTTP method to use
  headers: JSON                     # Request headers
  queryParams: JSON                 # URL query parameters
  body: String                      # Request body
  instruction: String!              # Natural language description of the transformation
  authentication: AuthType          # Authentication method
  responseSchema: JSONSchema        # Expected response format
  responseMapping: JSONata         # JSONata transformation expression
  pagination: Pagination           # Pagination configuration
  dataPath: String                 # Path to data in response
}
```

## ExtractConfig
Configuration for data extraction. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type ExtractConfig implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  urlHost: String!                  # Source URL or file location
  urlPath: String                   # Path component of the URL
  method: HttpMethod!               # HTTP method for API sources
  headers: JSON                     # Request headers
  queryParams: JSON                 # URL query parameters
  body: String                      # Request body
  instruction: String!              # Natural language description
  authentication: AuthType          # Authentication method
  fileType: FileType                # Format of the source file
  decompressionMethod: DecompressionMethod  # Decompression algorithm
  dataPath: String                  # Path to data in file/response
}
```

## TransformConfig
Configuration for data transformation. Inherits from [BaseConfig](overview.md#base-types).

```graphql
type TransformConfig implements BaseConfig {
  id: ID!
  version: String
  createdAt: DateTime
  updatedAt: DateTime
  
  instruction: String!              # Natural language description
  responseSchema: JSONSchema!       # Target data format
  responseMapping: JSONata!        # Transformation expression
  confidence: Float                # Confidence score of the mapping
  confidence_reasoning: String     # Explanation of confidence score
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
- `READONLY` - Read-only cache
- `WRITEONLY` - Write-only cache

See also:
- [Overview](overview.md) for common parameters
- [Mutations](mutations.md) for operations using these types
- [Queries](queries.md) for retrieving configurations 
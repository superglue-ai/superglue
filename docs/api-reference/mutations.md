# Mutations

## Execute Operations

### call
Executes an API call with the given configuration. Supports both one-time configurations and saved endpoints.

```graphql
mutation Call($input: ApiInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions) {
  call(input: $input, payload: $payload, credentials: $credentials, options: $options) {
    id
    success
    error
    startedAt
    completedAt
    data
    config {
      ... on ApiConfig {
        id
        urlHost
        method
      }
    }
  }
}
```

Input options:
- `input`: Either an ID of a saved configuration or a new [ApiConfig](types.md#apiconfig)
- `payload`: Variables to interpolate into the request
- `credentials`: Authentication credentials
- `options`: [Request options](overview.md#request-options)

### extract
Extracts data from a file or API response. Handles decompression and parsing of various file formats.

```graphql
mutation Extract($input: ExtractInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions) {
  extract(input: $input, payload: $payload, credentials: $credentials, options: $options) {
    id
    success
    error
    startedAt
    completedAt
    data
    config {
      ... on ExtractConfig {
        id
        fileType
        decompressionMethod
      }
    }
  }
}
```

Supported file types:
- CSV
- JSON
- XML
- AUTO (automatic detection)

### transform
Transforms data using JSONata expressions and validates against a schema.

```graphql
mutation Transform($input: TransformInputRequest!, $data: JSON!, $options: RequestOptions) {
  transform(input: $input, data: $data, options: $options) {
    id
    success
    error
    startedAt
    completedAt
    data
    config {
      ... on TransformConfig {
        id
        responseSchema
        responseMapping
      }
    }
  }
}
```

## Configuration Management

### upsertApi
Creates or updates an API configuration. Preserves existing fields unless explicitly overwritten.

```graphql
mutation UpsertApi($id: ID!, $input: JSON!) {
  upsertApi(id: $id, input: $input) {
    id
    urlHost
    urlPath
    method
    headers
    queryParams
    body
    authentication
    updatedAt
  }
}
```

### deleteApi
Deletes an API configuration. Returns `true` if successful.

### upsertExtraction
Creates or updates an extraction configuration. Similar to upsertApi but for [ExtractConfig](types.md#extractconfig).

### deleteExtraction
Deletes an extraction configuration. Returns `true` if successful.

### upsertTransformation
Creates or updates a transformation configuration. Similar to upsertApi but for [TransformConfig](types.md#transformconfig).

### deleteTransformation
Deletes a transformation configuration. Returns `true` if successful.

See also:
- [Types Reference](types.md) for input type definitions
- [Overview](overview.md) for authentication and common parameters 
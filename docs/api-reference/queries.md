---
title: 'Queries'
description: 'Queries are used to retrieve configs and logs.'
---

## List Operations

### listRuns
Returns a paginated list of execution runs.

```graphql
query ListRuns($limit: Int = 10, $offset: Int = 0) {
  listRuns(limit: $limit, offset: $offset) {
    items {
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
        ... on ExtractConfig {
          id
          fileType
        }
        ... on TransformConfig {
          id
          responseSchema
        }
      }
    }
    total
  }
}
```

### listApis
Returns a paginated list of API configurations.

```graphql
query ListApis($limit: Int = 10, $offset: Int = 0) {
  listApis(limit: $limit, offset: $offset) {
    items {
      id
      urlHost
      urlPath
      method
      authentication
      createdAt
      updatedAt
    }
    total
  }
}
```

### listTransforms
Returns a paginated list of transform configurations.

```graphql
query ListTransforms($limit: Int = 10, $offset: Int = 0) {
  listTransforms(limit: $limit, offset: $offset) {
    items {
      id
      responseSchema
      responseMapping
      createdAt
      updatedAt
    }
    total
  }
}
```

### listExtracts
Returns a paginated list of extract configurations.

```graphql
query ListExtracts($limit: Int = 10, $offset: Int = 0) {
  listExtracts(limit: $limit, offset: $offset) {
    items {
      id
      urlHost
      fileType
      decompressionMethod
      createdAt
      updatedAt
    }
    total
  }
}
```

## Get Operations

### getRun
Retrieves a specific execution run by ID.

```graphql
query GetRun($id: ID!) {
  getRun(id: $id) {
    id
    success
    error
    startedAt
    completedAt
    data
    config {
      id
      # Config fields vary by type
    }
  }
}
```

### getApi
Retrieves a specific API configuration by ID. Returns [ApiConfig](types.md#apiconfig).

### getTransform
Retrieves a specific transform configuration by ID. Returns [TransformConfig](types.md#transformconfig).

### getExtract
Retrieves a specific extract configuration by ID. Returns [ExtractConfig](types.md#extractconfig).

See also:
- [Types Reference](types.md) for detailed type definitions
- [Overview](overview.md) for common parameters 
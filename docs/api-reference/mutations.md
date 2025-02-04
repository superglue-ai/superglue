---
title: 'Mutations'
description: 'Mutations are used to execute operations and manage configs.'
---

## Execute Operations

### call
Executes an API call with the given configuration. Supports both one-time configurations and saved endpoints.

<Tabs>
  <Tab title="GraphQL">
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
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    // Using a one-time config
    const result = await client.call({
      endpoint: {
        urlHost: "https://api.example.com",
        urlPath: "/data",
        instruction: "Fetch user data",
        method: "GET",
        headers: {
          "Authorization": "Bearer token"
        }
      },
      payload: {
        userId: "123"
      },
      options: {
        cacheMode: "ENABLED",
        timeout: 5000
      }
    });

    // Using a saved config ID
    const result = await client.call({
      id: "saved-config-id",
      payload: {
        userId: "123"
      }
    });
    ```
  </Tab>
</Tabs>

### extract
Extracts data from a file or API response. Handles decompression and parsing of various file formats.

<Tabs>
  <Tab title="GraphQL">
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
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const result = await client.extract({
      endpoint: {
        urlHost: "https://example.com",
        urlPath: "/data.csv",
        instruction: "Extract user data from CSV",
        fileType: "CSV",
        decompressionMethod: "GZIP"
      },
      options: {
        timeout: 10000
      }
    });
    ```
  </Tab>
</Tabs>

### transform
Transforms data using JSONata expressions and validates against a schema.

<Tabs>
  <Tab title="GraphQL">
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
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const result = await client.transform({
      endpoint: {
        instruction: "Transform user data",
        responseSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" }
          }
        },
        responseMapping: "$.user"
      },
      data: {
        user: {
          name: "John",
          age: 30
        }
      }
    });
    ```
  </Tab>
</Tabs>

## Configuration Management

### upsertApi
Creates or updates an API configuration. Preserves existing fields unless explicitly overwritten.

<Tabs>
  <Tab title="GraphQL">
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
  </Tab>
  <Tab title="Client">
    ```typescript
    const client = new SuperglueClient({
      apiKey: 'YOUR_API_KEY'
    });

    const config = await client.upsertApi("config-id", {
      urlHost: "https://api.example.com",
      urlPath: "/users",
      method: "GET",
      headers: {
        "Authorization": "Bearer token"
      }
    });
    ```
  </Tab>
</Tabs>

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
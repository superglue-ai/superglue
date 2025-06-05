---
title: "Mutations"
description: "Mutations are used to execute operations and manage configs."
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
            urlPath
            method
            instruction
            authentication
            createdAt
            updatedAt
          }
          ... on ExtractConfig {
            id
            urlHost
            urlPath
            fileType
            decompressionMethod
            instruction
            authentication
            createdAt
            updatedAt
          }
          ... on TransformConfig {
            id
            instruction
            responseSchema
            responseMapping
            createdAt
            updatedAt
          }
        }
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const result = await client.call({
      endpoint: {
        id: "a-unique-id",
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
            urlHost
            urlPath
            fileType
            decompressionMethod
            instruction
            authentication
            createdAt
            updatedAt
          }
        }
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const result = await client.extract({
      endpoint: {
        id: "a-unique-id",
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
            instruction
            responseSchema
            responseMapping
            createdAt
            updatedAt
          }
        }
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const result = await client.transform({
      endpoint: {
        id: "a-unique-id",
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

### executeWorkflow

Executes a workflow (multiple APIs or Endpoints) in a single call.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions) {
      executeWorkflow(input: $input, payload: $payload, credentials: $credentials, options: $options) {
        success
        data
        finalTransform
        stepResults {
          stepId
          success
          rawData
          transformedData
          error
        }
        error
        startedAt
        completedAt
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const result = await client.executeWorkflow({
      workflow: {
        id: "workflow-id",
        steps: [/* ... */],
        finalTransform: "...",
        responseSchema: {/* ... */}
      },
      payload: {/* ... */},
      options: {/* ... */}
    });
    ```
  </Tab>
</Tabs>

## Configuration Management

### upsertApi

Creates or updates an API configuration.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpsertApi($id: ID!, $input: JSON!) {
      upsertApi(id: $id, input: $input) {
        id
        urlHost
        urlPath
        method
        instruction
        headers
        queryParams
        body
        authentication
        responseSchema
        responseMapping
        pagination {
          type
          pageSize
          cursorPath
        }
        dataPath
        updatedAt
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
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

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation DeleteApi($id: ID!) {
      deleteApi(id: $id)
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const success = await client.deleteApi("config-id");
    ```
  </Tab>
</Tabs>

### upsertExtraction

Creates or updates an extraction configuration.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpsertExtraction($id: ID!, $input: JSON!) {
      upsertExtraction(id: $id, input: $input) {
        id
        urlHost
        urlPath
        instruction
        fileType
        decompressionMethod
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const config = await client.upsertExtraction("extraction-config-id", {
      urlHost: "https://example.com",
      fileType: "CSV",
      instruction: "Extract data from CSV file."
    });
    ```
  </Tab>
</Tabs>

### deleteExtraction

Deletes an extraction configuration. Returns `true` if successful.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation DeleteExtraction($id: ID!) {
      deleteExtraction(id: $id)
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const success = await client.deleteExtraction("extraction-config-id");
    ```
  </Tab>
</Tabs>

### upsertTransformation

Creates or updates a transformation configuration.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpsertTransformation($id: ID!, $input: JSON!) {
      upsertTransformation(id: $id, input: $input) {
        id
        instruction
        responseSchema
        responseMapping
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const config = await client.upsertTransformation("transform-config-id", {
      instruction: "Transform user data to new schema",
      responseSchema: { type: "object", properties: { /* ... */ } },
      responseMapping: "$.users"
    });
    ```
  </Tab>
</Tabs>

### deleteTransformation

Deletes a transformation configuration. Returns `true` if successful.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation DeleteTransformation($id: ID!) {
      deleteTransformation(id: $id)
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const success = await client.deleteTransformation("transform-config-id");
    ```
  </Tab>
</Tabs>

### upsertWorkflow

Creates or updates a workflow configuration.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpsertWorkflow($id: ID!, $input: JSON!) {
      upsertWorkflow(id: $id, input: $input) {
        id
        steps { id /* ... */ }
        finalTransform
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const workflow = await client.upsertWorkflow("workflow-id", {
      steps: [
        // ...ExecutionStepInput objects
      ],
      finalTransform: "$.step1.data + $.step2.data"
    });
    ```
  </Tab>
</Tabs>

### deleteWorkflow

Deletes a workflow configuration. Returns `true` if successful.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation DeleteWorkflow($id: ID!) {
      deleteWorkflow(id: $id)
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const success = await client.deleteWorkflow("workflow-id");
    ```
  </Tab>
</Tabs>

See also:

- [Types Reference](types.md)
- [Overview](overview.md)
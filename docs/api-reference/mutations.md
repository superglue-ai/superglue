---
title: "Mutations"
description: "Mutations are used to execute operations and manage configs."
---

## Execute Operations

### executeWorkflow

Executes a workflow (multiple APIs or Endpoints) in a single call. Returns detailed step-by-step results.

**Parameters:**
- `input`: WorkflowInputRequest! - Either a workflow configuration or saved workflow ID
- `payload`: JSON - Input data for the workflow (optional)
- `credentials`: JSON - Runtime credentials for integrations (optional)
- `options`: RequestOptions - Execution options (optional, see [RequestOptions defaults](overview.md#requestoptions))

**Returns:** `WorkflowResult` with individual step results and final output

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions) {
      executeWorkflow(input: $input, payload: $payload, credentials: $credentials, options: $options) {
        id
        success
        data
        error
        startedAt
        completedAt
        config {
          id
          version
          instruction
        }
        stepResults {
          stepId
          success
          rawData
          transformedData
          error
        }
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

### buildWorkflow

Builds a workflow automatically based on instructions and available integrations. Uses AI to determine the optimal sequence of API calls and data transformations.

**Parameters:**
- `instruction`: String! - Natural language description of what the workflow should do (required)
- `payload`: JSON - Sample input data to help with workflow generation (optional)
- `integrationIds`: [ID!]! - List of integration IDs to use in the workflow (required)
- `responseSchema`: JSONSchema - Desired output format (optional, auto-generated if not provided)

**Returns:** Complete `Workflow` configuration ready for execution

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation BuildWorkflow(
      $instruction: String!,
      $payload: JSON,
      $integrationIds: [ID!]!,
      $responseSchema: JSONSchema
    ) {
      buildWorkflow(
        instruction: $instruction,
        payload: $payload,
        integrationIds: $integrationIds,
        responseSchema: $responseSchema
      ) {
        id
        version
        instruction
        steps {
          id
          apiConfig {
            id
            urlHost
            urlPath
            method
            instruction
          }
          integrationId
          executionMode
          inputMapping
          responseMapping
        }
        finalTransform
        responseSchema
        inputSchema
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const workflow = await client.buildWorkflow({
      instruction: "Get user profile and their recent posts",
      payload: { userId: "123" },
      integrationIds: ["user-api", "posts-api"],
      responseSchema: {
        type: "object",
        properties: {
          user: { type: "object" },
          posts: { type: "array" }
        }
      }
    });
    ```
  </Tab>
</Tabs>

## Configuration Management

### upsertWorkflow

Creates or updates a workflow configuration.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpsertWorkflow($id: ID!, $input: JSON!) {
      upsertWorkflow(id: $id, input: $input) {
        id
        version
        instruction
        steps {
          id
          apiConfig {
            id
            urlHost
            urlPath
            method
            instruction
          }
          integrationId
          executionMode
          inputMapping
          responseMapping
        }
        finalTransform
        responseSchema
        inputSchema
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

### upsertIntegration

Creates or updates an integration configuration. Integrations represent connections to external APIs or databases.

**Parameters:**
- `input`: IntegrationInput! - Integration configuration (required)
- `mode`: UpsertMode - CREATE, UPDATE, or UPSERT (default: UPSERT)

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpsertIntegration($input: IntegrationInput!, $mode: UpsertMode = UPSERT) {
      upsertIntegration(input: $input, mode: $mode) {
        id
        name
        type
        urlHost
        urlPath
        credentials
        documentationUrl
        documentation
        documentationPending
        specificInstructions
        icon
        version
        createdAt
        updatedAt
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const integration = await client.upsertIntegration({
      id: "github-api",
      name: "GitHub API",
      urlHost: "https://api.github.com",
      credentials: {
        token: "ghp_..."
      },
      documentationUrl: "https://docs.github.com/en/rest",
      specificInstructions: "Use GitHub's REST API v4 with rate limiting"
    }, "UPSERT");
    ```
  </Tab>
</Tabs>

### deleteIntegration

Deletes an integration configuration. Returns `true` if successful.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation DeleteIntegration($id: ID!) {
      deleteIntegration(id: $id)
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const success = await client.deleteIntegration("integration-id");
    ```
  </Tab>
</Tabs>

## Deprecated Operations

The following operations are deprecated. Use `executeWorkflow` and workflow management operations instead.

### call (Deprecated)

**⚠️ Deprecated:** Use `executeWorkflow` instead for better performance and capabilities.

Executes an API call with the given configuration. Supports both one-time configurations and saved endpoints.

**Parameters:**
- `input`: ApiInputRequest! - Either an endpoint configuration or a saved endpoint ID
- `payload`: JSON - Data to pass to the API (optional)
- `credentials`: JSON - Runtime credentials (optional, overrides stored credentials)
- `options`: RequestOptions - Execution options (optional, see [RequestOptions defaults](overview.md#requestoptions))

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
          ... on Workflow {
            id
            version
            instruction
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
        selfHealing: "ENABLED",
        timeout: 5000
      }
    });
    ```
  </Tab>
</Tabs>

### extract (Deprecated)

**⚠️ Deprecated:** Use `executeWorkflow` instead for better performance and capabilities.

Extracts data from a file or API response. Handles decompression and parsing of various file formats.

**Parameters:**
- `input`: ExtractInputRequest! - Either an extraction configuration, file upload, or saved extraction ID
- `payload`: JSON - Additional data for the extraction (optional)
- `credentials`: JSON - Runtime credentials for API sources (optional)
- `options`: RequestOptions - Execution options (optional, see [RequestOptions defaults](overview.md#requestoptions))

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
        selfHealing: "ENABLED",
        timeout: 10000
      }
    });
    ```
  </Tab>
</Tabs>

### transform (Deprecated)

**⚠️ Deprecated:** Use `executeWorkflow` instead for better performance and capabilities.

Transforms data using JSONata expressions and validates against a schema.

**Parameters:**
- `input`: TransformInputRequest! - Either a transformation configuration or saved transform ID
- `data`: JSON! - Input data to transform (required)
- `options`: RequestOptions - Execution options (optional, see [RequestOptions defaults](overview.md#requestoptions))

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

### upsertApi (Deprecated)

**⚠️ Deprecated:** Use workflow-based operations instead.

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

### updateApiConfigId (Deprecated)

**⚠️ Deprecated:** Use workflow-based operations instead.

Updates the ID of an existing API configuration.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpdateApiConfigId($oldId: ID!, $newId: ID!) {
      updateApiConfigId(oldId: $oldId, newId: $newId) {
        id
        urlHost
        urlPath
        method
        instruction
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const updatedConfig = await client.updateApiConfigId("old-id", "new-id");
    ```
  </Tab>
</Tabs>

### deleteApi (Deprecated)

**⚠️ Deprecated:** Use workflow-based operations instead.

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

### upsertExtraction (Deprecated)

**⚠️ Deprecated:** Use workflow-based operations instead.

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

### deleteExtraction (Deprecated)

**⚠️ Deprecated:** Use workflow-based operations instead.

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

### upsertTransformation (Deprecated)

**⚠️ Deprecated:** Use workflow-based operations instead.

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

### deleteTransformation (Deprecated)

**⚠️ Deprecated:** Use workflow-based operations instead.

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

See also:

- [Types Reference](types.md)
- [Overview](overview.md)
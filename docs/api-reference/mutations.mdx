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

Builds a workflow automatically based on instructions and available integrations. Uses AI to determine the optimal sequence of API calls and data transformations. Supports both API-based workflows and transform-only workflows for data processing.

**Parameters:**
- `instruction`: String! - Natural language description of what the workflow should do (required)
- `payload`: JSON - Sample input data to help with workflow generation (optional, supports file upload data)
- `integrationIds`: [ID!] - List of integration IDs to use in the workflow (optional - omit for transform-only workflows)
- `responseSchema`: JSONSchema - Desired output format (optional, auto-generated if not provided)

**Returns:** Complete `Workflow` configuration ready for execution

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation BuildWorkflow(
      $instruction: String!,
      $payload: JSON,
      $integrationIds: [ID!],
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
    // API-based workflow with integrations
    const apiWorkflow = await client.buildWorkflow({
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

    // Transform-only workflow for file processing (no integrations)
    const transformWorkflow = await client.buildWorkflow({
      instruction: "Extract customer names and total amounts from invoices",
      payload: {
        invoice_001: { /* parsed CSV/JSON data from file upload */ },
        invoice_002: { /* parsed Excel data from file upload */ }
      },
      // No integrationIds needed for transform-only workflows
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            customerName: { type: "string" },
            totalAmount: { type: "number" }
          }
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

### upsertWorkflowSchedule

Creates or updates a workflow schedule for recurring execution.

**Parameters:**
- `schedule`: WorkflowScheduleInput! - Schedule configuration (required)

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation UpsertWorkflowSchedule($schedule: WorkflowScheduleInput!) {
      upsertWorkflowSchedule(schedule: $schedule) {
        id
        workflowId
        cronExpression
        timezone
        enabled
        payload
        options
        lastRunAt
        nextRunAt
        createdAt
        updatedAt
      }
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    // Create a new schedule - runs daily at 2 AM Eastern Time
    const dailySchedule = await client.upsertWorkflowSchedule({
      workflowId: "customer-sync-workflow",
      cronExpression: "0 2 * * *",
      timezone: "America/New_York",
      enabled: true,
      payload: { 
        syncMode: "incremental" 
      },
      options: { 
        selfHealing: "ENABLED"
      }
    });

    // Hourly sync during business hours (9 AM - 5 PM, Monday-Friday)
    const businessHoursSchedule = await client.upsertWorkflowSchedule({
      workflowId: "realtime-data-sync",
      cronExpression: "0 9-17 * * 1-5",
      timezone: "America/Los_Angeles",
      enabled: true
    });

    // Every 15 minutes
    const frequentSchedule = await client.upsertWorkflowSchedule({
      workflowId: "quick-polling-workflow",
      cronExpression: "*/15 * * * *",
      timezone: "UTC",
      enabled: true
    });

    // Update existing schedule (disable it)
    const updated = await client.upsertWorkflowSchedule({
      id: "existing-schedule-id",
      enabled: false
    });

    // Update cron expression (runs weekly on Monday at 9 AM)
    const weeklySchedule = await client.upsertWorkflowSchedule({
      id: "existing-schedule-id",
      cronExpression: "0 9 * * 1",
      timezone: "Europe/London"
    });
    ```
  </Tab>
</Tabs>

### deleteWorkflowSchedule

Deletes a workflow schedule. Returns `true` if successful.

<Tabs>
  <Tab title="GraphQL">
    ```graphql
    mutation DeleteWorkflowSchedule($id: ID!) {
      deleteWorkflowSchedule(id: $id)
    }
    ```
  </Tab>
  <Tab title="Client">
    ```typescript
    const success = await client.deleteWorkflowSchedule("schedule-id");
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

See also:

- [Types Reference](types.md)
- [Overview](overview.md)
---
title: "MCP Tool Reference"
description: "superglue MCP provides tools for integration setup, workflow execution and integration code generation."
---

The following tools are exposed by superglue's MCP server. The input schemas are defined using Zod in `mcp-server.ts`.

## Workflow Discovery & Management

### superglue_list_available_workflows

Lists all available superglue workflows for the current organization.

**Input Schema:**
- `limit`: (Optional) Number of workflows to return (default: 100)
- `offset`: (Optional) Offset for pagination (default: 0)

**Returns:**
- List of workflows with their IDs, instructions, timestamps, and saved credentials
- Use the workflow IDs with `superglue_execute_workflow` to run specific workflows

**Example Usage:**
```json
{
  "toolName": "superglue_list_available_workflows",
  "inputs": {
    "limit": 50,
    "offset": 0
  }
}
```

### superglue_find_relevant_integrations

Finds integrations relevant to a given natural language instruction. Used as a first step before building a new workflow.

**Input Schema:**
- `instruction`: (Optional) Natural language description of what you want to do. If not provided, returns all available integrations.

**Returns:**
- List of suggested integration IDs with reasons and available credentials
- If no integrations exist, returns empty list and sugggests creating new integrations

**Example Usage:**
```json
{
  "toolName": "superglue_find_relevant_integrations",
  "inputs": {
    "instruction": "I need to sync data between Stripe and HubSpot"
  }
}
```

## Workflow Execution

### superglue_execute_workflow

Executes a previously saved superglue workflow by its ID.

**Input Schema:**
- `id`: **Required** - The ID of the workflow to execute
- `payload`: (Optional) JSON payload to pass to the workflow
- `credentials`: (Optional) Additional credentials that will be merged with integration credentials
- `options`: (Optional) Request configuration (caching, timeouts, retries, etc.)

<Note>
**Important Notes:**
- This tool is for running existing, saved workflows only
- To create a new workflow, use `superglue_build_and_run`
- Workflow ID must exist (use `superglue_list_available_workflows` to find valid IDs)
</Note>

**Example Usage:**
```json
{
  "toolName": "superglue_execute_workflow",
  "inputs": {
    "id": "stripe-to-hubspot-sync",
    "payload": { "customerId": "cus_123" },
    "credentials": { 
      "additionalApiKey": "sk_test_..."
    }
  }
}
```

## Workflow Building & Testing

### superglue_build_and_run

Builds and executes workflows. This is the primary tool for creating and iteratively testing workflows.

**Input Schema:**
- `instruction`: **Required** - Natural language instruction to build a new workflow from scratch
- `integrationIds`: **Required** - Array of integration IDs to use in the workflow
- `payload`: (Optional) JSON payload for the workflow execution
- `credentials`: (Optional) Additional credentials that will be merged with integration credentials
- `responseSchema`: (Optional) JSONSchema for the expected output structure

<Note>
**Important Notes:**
- This tool only builds and tests workflows - it does NOT save them
- Building and testing can take up to 1 minute
- Use `superglue_find_relevant_integrations` first to discover available integration IDs
- After successful execution, use `superglue_save_workflow` to persist the workflow
</Note>

**Example Usage:**
```json
{
  "toolName": "superglue_build_and_run",
  "inputs": {
    "instruction": "Fetch customer data from Stripe and create or update contact in HubSpot",
    "integrationIds": ["stripe", "hubspot"],
    "payload": { "customerId": "cus_123" },
    "responseSchema": {
      "type": "object",
      "properties": {
        "hubspotContactId": { "type": "string" },
        "status": { "type": "string" }
      }
    }
  }
}
```

### superglue_save_workflow

Saves a previously built and tested workflow. Use this after successful execution of `superglue_build_and_run`.

**Input Schema:**
- `id`: **Required** - Unique identifier for the workflow to save
- `workflow`: **Required** - Workflow configuration object from build_and_run result

<Note>
**Important Notes:**
- Take the workflow data from build_and_run result's `config` field
- DO NOT set any fields to null - omit optional fields entirely
- Each step MUST have an integrationId field
- Workflow MUST have integrationIds array
</Note>

**Example Usage:**
```json
{
  "toolName": "superglue_save_workflow",
  "inputs": {
    "id": "stripe-to-hubspot-sync",
    "workflow": {
      "steps": [...],
      "integrationIds": ["stripe", "hubspot"],
      "instruction": "Sync Stripe customers to HubSpot",
      "finalTransform": "$",
      "responseSchema": {...}
    }
  }
}
```

## Integration Management

### superglue_create_integration

Creates and immediately saves a new integration. Integrations are building blocks for workflows and contain the credentials for accessing APIs.

**Input Schema:**
- `id`: **Required** - A unique identifier for the new integration
- `name`: (Optional) Human-readable name for the integration
- `urlHost`: (Optional) Base URL/hostname for the API including protocol
- `urlPath`: (Optional) Path component of the URL
- `documentationUrl`: (Optional) URL to the API documentation
- `documentation`: (Optional) API documentation content, if provided directly
- `credentials`: **Required** - Credentials object (can be empty {} if no credentials needed)

<Note>
**Important Notes:**
- Most APIs require authentication (API keys, tokens, etc.)
- Always store credentials in the credentials field
- Use placeholder references: `<<{integration_id}_{credential_name}>>`
- Split information clearly: urlHost (without secrets), credentials (with secrets)
- Providing a documentationUrl triggers async documentation processing
</Note>

**Example Usage:**
```json
{
  "toolName": "superglue_create_integration",
  "inputs": {
    "id": "my-api",
    "name": "My Custom API",
    "urlHost": "https://api.example.com",
    "credentials": {
      "apiKey": "sk_live_abc123"
    },
    "documentationUrl": "https://api.example.com/docs"
  }
}
```

## Code Generation

### superglue_get_workflow_integration_code

Generate integration code for a specific workflow. Use this to show users how to implement a workflow in their applications.

**Input Schema:**
- `workflowId`: **Required** - The ID of the workflow to generate code for
- `language`: **Required** - Programming language: `typescript`, `python`, or `go`

**Returns:**
- Ready-to-use SDK code for the specified language
- Includes example payload and credentials based on the workflow's input schema

**Example Usage:**
```json
{
  "toolName": "superglue_get_workflow_integration_code",
  "inputs": {
    "workflowId": "stripe-to-hubspot-sync",
    "language": "typescript"
  }
}
```

## Agent Workflow

The recommended workflow for agents using the Superglue MCP server:

1. **DISCOVER**: Use `superglue_find_relevant_integrations` to find available integrations for your task
2. **BUILD & TEST**: Use `superglue_build_and_run` with instruction and integrations. Iterate until successful
3. **SAVE** (Optional): Ask user if they want to save the workflow, then use `superglue_save_workflow` with the workflow data
4. **EXECUTE**: Use `superglue_execute_workflow` for saved workflows
5. **INTEGRATE**: Use `superglue_get_workflow_integration_code` to generate SDK code

<Info>
**Best Practices**
- Always start with `superglue_find_relevant_integrations` for discovery
- Create integrations and store credentials using `superglue_create_integration`
- Ask users for credentials if needed
- Ask user before saving workflows
- When saving workflows, NEVER set fields to null - omit optional fields if no value available
- Copy actual values from build_and_run results, don't assume fields are empty
</Info>
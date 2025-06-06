---
title: "MCP Tool Reference"
description: "superglue MCP provides tools for workflow creation, execution and integration code generation."
---

The following tools are exposed by superglue's MCP server. The input schemas are defined using Zod in `mcp-server.ts`.

#### 1. `superglue_execute_tool`

- **Description**: Execute a specific Superglue tool by ID. Use this when you know the exact tool needed for a task.
- **Input Schema**: `ExecuteToolInputSchema`
  - `id`: The ID of the tool to execute.
  - `payload`: (Optional) JSON payload to pass to the tool.
  - `credentials`: (Optional) JSON credentials for the tool execution.
  - `options`: (Optional) Request configuration (caching, timeouts, retries, etc.).

<Note>
  **Important Notes**

  - Tool ID must exist (use dynamic `execute_{tool_id}` tools to find valid IDs)
  - **CRITICAL**: Include **ALL** required credentials in the credentials object
  - Payload structure must match the tool's expected input schema
  - Returns execution results \+ SDK code for integration
</Note>

- **Example Usage (Conceptual MCP Call)**:

  ```json
  // MCP callTool params
  {
    "toolName": "superglue_execute_tool",
    "inputs": {
      "id": "tool-id-123",
      "payload": { "inputData": "example" },
      "credentials": { "apiKey": "your-api-key" }
    }
  }
  ```

#### 2. `superglue_build_new_tool`

- **Description**: Build a new integration tool from natural language instructions. Use when existing tools don't meet requirements. Built tools are immediately saved and dynamically made available as new tools.
- **Input Schema**: `BuildToolInputSchema`
  - `instruction`: Natural language instruction for building the tool.
  - `payload`: (Optional) Example JSON payload for the tool. This should be data needed to fulfill the request (e.g. a list of ids to loop over), not settings or filters.
  - `systems`: Array of `SystemInputSchema` defining the systems the tool can interact with.
    - `id`: Unique identifier for the system.
    - `urlHost`: Base URL/hostname for the system.
    - `urlPath`: (Optional) Base path for API calls.
    - `documentationUrl`: (Optional) URL to API documentation.
    - `credentials`: (Optional) Credentials for accessing the system. MAKE SURE YOU INCLUDE ALL OF THEM BEFORE BUILDING THE CAPABILITY, OTHERWISE IT WILL FAIL.
  - `responseSchema`: (Optional) JSONSchema for the expected response structure.

<Note>
  **Important Notes:**

  - Gather **ALL** system credentials **BEFORE** building (API keys, tokens, documentation url if the system is less known)
  - Built workflows are saved, but not immediately executed
  - Provide detailed, specific instructions
  - superglue handles pagination for you, so you don't need to worry about it
  - Tool building may take 30-60 seconds
</Note>

- **Example Usage (Conceptual MCP Call)**:

  ```json
  // MCP callTool params
  {
    "toolName": "superglue_build_new_tool",
    "inputs": {
      "instruction": "Fetch user data from system A and send it to system B.",
      "systems": [
        { 
          "id": "systemA", 
          "urlHost": "https://api.systema.com",
          "credentials": { "apiKey": "system-a-key" }
        },
        { 
          "id": "systemB", 
          "urlHost": "https://api.systemb.com",
          "credentials": { "token": "system-b-token" }
        }
      ]
    }
  }
  ```


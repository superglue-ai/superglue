---
title: "MCP Tool Reference"
description: "superglue MCP provides reliabel access to your superglue tools that run in production."
---

The superglue MCP server exposes a minimal set of tools focused on discovering and executing your pre-built superglue tools. Build and manage tools via the [superglue UI](https://app.superglue.cloud) or [SDK](/agent-builders/sdk-integration), then execute them reliably through MCP in any agentic context.

## Available MCP Tools

### superglue_find_relevant_tools

Search for saved superglue tools using natural language. Uses AI to intelligently match your query to relevant tools.

**Input Schema:**
- `searchTerms`: (Optional) Natural language search query. If not provided, empty, or set to `*` or `all`, returns all available tools.

**Behavior:**
- AI matches your query to relevant tools and explains why each tool is relevant via the `reason` field
- If no specific matches are found or an error occurs, returns all available tools as a fallback
- Each tool includes its input/output schemas to help understand what data it expects and returns

**Returns:**
```typescript
{
  success: boolean;
  tools: Array<{
    id: string;              // Tool identifier for execution
    instruction?: string;    // What the tool does
    inputSchema?: object;    // Input schema for the tool
    steps: Array<{
      integrationId?: string;      // Integration used in this step
      instruction?: string;        // Step-level instruction
    }>;
    responseSchema?: object; // Output schema for the tool
    reason: string;          // Why this tool matches your search
  }>;
}

```

**Example Usage:**
```json
{
  "toolName": "superglue_find_relevant_tools",
  "inputs": {
    "searchTerms": "github slack pr channel notifications"
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "tools": [
    {
      "id": "send-slack-alert",
      "instruction": "Post alert message to Slack pr channel",
      "inputSchema": {
        "type": "object",
        "properties": {
          "channel": { "type": "string" },
          "message": { "type": "string" }
        },
        "required": ["channel", "message"]
      },
      "steps": [
        {
          "integrationId": "slack",
          "instruction": "Post a payload message to the Slack pr channel"
        }
      ],
      "responseSchema": {
        "type": "object",
        "properties": {
          "messageId": { "type": "string" },
          "timestamp": { "type": "string" }
        }
      },
      "reason": "Matches Slack posting functionality"
    }
  ]
}
```

### superglue_execute_tool

Execute a saved superglue tool by its ID.

**Input Schema:**
- `id`: **Required** - The ID of the tool to execute (get from `superglue_find_relevant_tools`)
- `payload`: (Optional) JSON payload to pass to the tool

**Returns:**
```typescript
{
  success: boolean;
  data?: any;       // Tool result data (truncated to 20K chars if large)
  error?: string;   // Error message if execution failed
}
```

**Restrictions:**
- Only `id` and `payload` parameters are allowed
- No `options`, `credentials`, or other parameters supported via MCP
- Self-healing is automatically disabled for MCP executions
- Large results (>20K chars) are automatically truncated before being returned to the agent

**Example Usage:**
```json
{
  "toolName": "superglue_execute_tool",
  "inputs": {
    "id": "send-slack-alert",
    "payload": {
      "channel": "pr",
      "message": "New PR opened!"
    }
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "ok": true,
    "channel": "C123456",
    "ts": "1234567890.123456"
  }
}
```

## Typical MCP Workflow

<Steps>
  <Step title="Search for Tools">
    Use `superglue_find_relevant_tools` to discover available tools:
    ```
    "Find my Pokemon data tools"
    ```
  </Step>
  <Step title="Execute Tool">
    Use `superglue_execute_tool` with the tool ID and any required payload:
    ```json
    {
      "id": "pokeapi-bulbasaur-moves",
      "payload": {}
    }
    ```
  </Step>
  <Step title="Process Results">
    The tool returns only the data or error - no workflow metadata or step results
  </Step>
</Steps>

## Building New Tools

MCP only executes existing tools. To create new tools:

1. **Via UI**: Build workflows at [app.superglue.cloud](https://app.superglue.cloud)
2. **Via SDK**: Use `SuperglueClient.buildWorkflow()` - see [SDK Integration](/agent-builders/sdk-integration)
3. **Via GraphQL**: Call `buildWorkflow` mutation directly

Once saved, tools become available through MCP's `superglue_find_relevant_tools` and `superglue_execute_tool`.

<Info>
**Why This Design?**
- Building workflows debugging, documentation, and iteration - better suited for UI/SDK
- Executing workflows needs only an ID and payload - perfect for lightweight MCP calls
- This separation keeps MCP tools fast, deterministic, and reliable
</Info>
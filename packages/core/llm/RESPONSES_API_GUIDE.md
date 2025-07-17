# OpenAI Responses API Implementation Guide

This guide explains how to use the OpenAI Responses API in the Superglue codebase, following best practices from the official documentation.

## Overview

The OpenAI Responses API is now the default for all OpenAI model interactions in Superglue. All methods (`generateText`, `generateObject`, `executeTool`, and `executeTaskWithTools`) use the Responses API by default, with automatic fallback to the chat completions API if needed.

Key benefits:
- Stateless conversation management with `previous_response_id`
- Built-in support for structured outputs
- Function calling with strict mode
- Better handling of multi-turn conversations
- Automatic storage and retrieval of responses
- Consistent API across all methods

## Key Methods

### 1. `executeTool()` - Single Tool Call

Use this method when you need the model to call exactly one tool from a list of available tools.

```typescript
const response = await openAIModel.executeTool(
  messages,
  tools,
  temperature = 0.2,
  forceToolUse = true  // Set to true to require a tool call
);

// Response structure:
{
  toolCall: {
    id: string,
    name: string,
    arguments: Record<string, any>
  } | null,
  textResponse?: string,  // Any text the model generated
  messages: ChatCompletionMessageParam[]
}
```

**Best Practices:**
- Set `forceToolUse = true` when you need guaranteed tool usage
- Use lower temperatures (0.2) for more deterministic tool selection
- Always validate the returned arguments before executing the tool

### 2. `executeTaskWithTools()` - Autonomous Multi-Tool Execution

Use this method for agentic workflows where the model can autonomously call multiple tools to complete a task.

```typescript
const response = await openAIModel.executeTaskWithTools(
  messages,
  tools,
  async (toolCall) => {
    // Your tool execution logic
    return {
      toolCallId: toolCall.id,
      result: await executeYourTool(toolCall.name, toolCall.arguments)
    };
  },
  {
    maxIterations: 10,
    temperature: 0.2
  }
);

// Response structure:
{
  finalResult: any,  // The final text response from the model
  toolCalls: ToolCall[],  // All tools that were called
  executionTrace: Array<{
    toolCall: ToolCall,
    result: ToolResult
  }>,
  messages: ChatCompletionMessageParam[]
}
```

**Best Practices:**
- The method automatically adds agentic system prompts for better autonomous behavior
- Set reasonable `maxIterations` to prevent infinite loops
- The model will continue until it produces a final text response
- Uses `previous_response_id` for conversation continuity
- Enables `parallel_tool_calls` for efficiency

### 3. `generateObject()` - Structured JSON Generation

Use this method to generate JSON that conforms to a specific schema. This now uses the Responses API's `text.format` feature by default, with fallback to chat completions.

```typescript
const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "number" },
    skills: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["name", "age", "skills"]
};

const response = await openAIModel.generateObject(
  messages,
  schema,
  temperature = 0
);

// Response structure:
{
  response: any,  // The parsed JSON object
  messages: ChatCompletionMessageParam[]
}
```

**Best Practices:**
- The method automatically adds `additionalProperties: false` for strict mode
- All fields must be marked as `required` (use union with `null` for optional fields)
- The schema is validated and enforced by the model
- Falls back to chat completions API if Responses API fails

## Tool Definition Best Practices

### 1. Clear and Specific Descriptions

```typescript
const goodToolDefinition: ToolDefinition = {
  name: "search_documentation",
  description: "Search integration documentation for specific information about API structure, endpoints, authentication patterns, etc. Use this when you need to understand how an API works, what endpoints are available, or how to authenticate.",
  parameters: {
    type: "object",
    properties: {
      integrationId: {
        type: "string",
        description: "ID of the integration to search (e.g., 'stripe', 'hubspot')"
      },
      query: {
        type: "string",
        description: "What to search for in the documentation (e.g., 'authentication', 'batch processing', 'rate limits')"
      }
    },
    required: ["integrationId", "query"]
  }
};
```

### 2. Use Enums for Constrained Values

```typescript
const toolWithEnum: ToolDefinition = {
  name: "update_status",
  description: "Update the status of an item",
  parameters: {
    type: "object",
    properties: {
      itemId: { type: "string" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "cancelled"],
        description: "The new status for the item"
      }
    },
    required: ["itemId", "status"]
  }
};
```

### 3. Optional Parameters with Null Union

```typescript
const toolWithOptional: ToolDefinition = {
  name: "search_items",
  description: "Search for items with optional filters",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      category: {
        type: ["string", "null"],
        description: "Optional category filter"
      },
      maxResults: {
        type: ["number", "null"],
        description: "Maximum number of results (default: 10)"
      }
    },
    required: ["query", "category", "maxResults"]  // All required, but can be null
  }
};
```

## Migration Notes

The `generateObject` method now uses the Responses API by default, providing:
- Better reliability with strict mode
- Automatic fallback to chat completions on failure
- Compliance with Responses API best practices
- No need to manually enforce schema constraints

## Error Handling

All methods include proper error handling:

```typescript
try {
  const response = await openAIModel.executeTool(messages, tools, 0.2, true);
  if (!response.toolCall) {
    // Handle case where no tool was called
  }
} catch (error) {
  // Handle errors
}
```

## Performance Considerations

1. **Strict Mode**: Always enabled for reliability, may have slight latency on first request with new schema
2. **Storage**: Multi-turn conversations are stored by default, single calls are not
3. **Parallel Tool Calls**: Enabled by default in `executeTaskWithTools` for better performance
4. **Temperature**: Use 0 for deterministic outputs, 0.2 for slight variation

## Future Improvements

1. **Streaming Support**: Add streaming for real-time tool call progress
2. **Built-in Tools**: Support for OpenAI's built-in tools (web search, file search)
3. **Reasoning Models**: Special handling for o-series models
4. **Prompt Caching**: Optimize for repeated schemas and instructions 


🔍 Triggering finish_reason: "stop" after a tool call
The model’s own logic determines finish_reason; you can’t force it based on your tool's return value.

The model may return "stop" even immediately after a function call, but this is inconsistent and not reliable 
Microsoft Learn
+11
OpenAI Community
+11
Vellum
+11
OpenAI Community
+1
OpenAI Community
+1
.

🛠 Using tool_choice: "required"
tool_choice: "required" forces the model to call one of the provided functions each turn.

However, it does not guarantee a clean finish_reason; you'll often see missing or unexpected values, and sometimes loops can occur 
OpenAI Community
+1
OpenAI Community
+1
.

✅ Recommended Signal Pattern
Use turn-level orchestration instead of depending solely on finish signals:

ts
Copy
let madeToolCall = false;

for (...) {
  const resp = await create(...);
  for (const o of resp.output) {
    if (o.type === 'function_call') {
      madeToolCall = true;
      // execute tool & inject result
    } else if (o.type === 'message') {
      // collect assistant text
    }
  }
  if (!madeToolCall && resp.finish_reason === 'stop') {
    // ✅ done
  }
  madeToolCall = false;
}
This ensures you loop until you receive regular assistant text without tool calls + finish_reason:'stop'.

📌 Summary Table
Feature	finish_reason: stop	Guaranteed Tool Call
tool_choice: auto	MAY follow tool call ✅	❌
tool_choice: required	UNRELIABLE	✅ Always one tool
Orchestration logic	✅ Wait for text + stop	✅ Precisely controlled

In short:

You can’t force a "stop" finish programmatically after a tool result.

tool_choice: "required" ensures a tool call, but not a clean finish.

Best practice: orchestrate loop termination yourself by checking for text + no tool calls + finish_reason === "stop".


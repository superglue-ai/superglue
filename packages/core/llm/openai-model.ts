import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMAutonomousResponse, LLMObjectResponse, LLMResponse, ToolCall, ToolDefinition, ToolResult } from "./llm.js";
import { AGENTIC_SYSTEM_PROMPT } from "./prompts.js";


export class OpenAIModel implements LLM {
  public contextLength: number = 128000;
  private model: OpenAI;
  constructor() {
    this.model = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }
  async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
    // Prepare input messages for Responses API
    const input = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    }));

    // Add date context
    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    };
    input.unshift(dateMessage as any);

    try {
      // Call Responses API
      const response = await (this.model.responses.create as any)({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        input: input as any,
        temperature: process.env.OPENAI_MODEL?.startsWith('o') ? undefined : temperature,
        store: false  // Don't store for simple text generation
      }) as any;

      // Extract text response
      let responseText = '';
      for (const output of response.output || []) {
        if (output.type === 'message' && output.role === 'assistant') {
          for (const content of output.content || []) {
            if (content.type === 'output_text') {
              responseText += content.text;
            }
          }
        }
      }

      if (!responseText) {
        throw new Error('No text output generated');
      }

      // Add response to messages history
      const updatedMessages = [...messages, {
        role: "assistant",
        content: responseText
      }];

      return {
        response: responseText,
        messages: updatedMessages
      } as LLMResponse;
    } catch (error) {
      console.error('Error in generateText with Responses API:', error);
      // Fall back to chat completions API
      const result = await this.model.chat.completions.create({
        messages: [dateMessage as ChatCompletionMessageParam, ...messages],
        model: process.env.OPENAI_MODEL || "gpt-4o",
        temperature: process.env.OPENAI_MODEL?.startsWith('o') ? undefined : temperature
      });

      let responseText = result.choices[0].message.content;

      const updatedMessages = [...messages, {
        role: "assistant",
        content: responseText
      }];

      return {
        response: responseText,
        messages: updatedMessages
      } as LLMResponse;
    }
  }

  private enforceStrictSchema(schema: any, isRoot: boolean) {
    if (!schema || typeof schema !== 'object') return schema;

    // wrap non-object in object with ___results key
    if (isRoot && schema.type !== 'object') {
      schema = {
        type: 'object',
        properties: {
          ___results: { ...schema }  // Create a copy of the schema
        },
        required: ['___results']
      };
    }

    if (schema.type === 'object' || schema.type === 'array') {
      schema.additionalProperties = false;
      schema.strict = true;
      if (schema.properties) {
        // Only set required for the top-level schema
        schema.required = Object.keys(schema.properties);
        delete schema.patternProperties;
        // Recursively process nested properties
        Object.values(schema.properties).forEach(prop => this.enforceStrictSchema(prop, false));
      }
      if (schema.items) {
        schema.items = this.enforceStrictSchema(schema.items, false);
        delete schema.minItems;
        delete schema.maxItems;
      }
    }

    return schema;
  };

  async generateObject(messages: ChatCompletionMessageParam[], schema: any, temperature: number = 0): Promise<LLMObjectResponse> {
    // Prepare input messages for Responses API
    const input = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    }));

    // Add date context
    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    };
    input.unshift(dateMessage as any);

    // Prepare text format based on whether schema is provided
    let textFormat: any;
    if (schema) {
      // Prepare schema for strict validation
      schema = addNullableToOptional(schema);
      schema = this.enforceStrictSchema(schema, true);

      textFormat = {
        format: {
          type: "json_schema",
          name: "structured_response",
          schema: schema,
          strict: true
        }
      };
    } else {
      textFormat = {
        format: {
          type: "json_object"
        }
      };
    }

    try {
      const response = await (this.model.responses.create as any)({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        input: input as any,
        temperature: process.env.OPENAI_MODEL?.startsWith('o') ? undefined : temperature,
        text: textFormat,
        store: false  // Don't store for single structured output calls
      }) as any;

      // Extract the structured output
      let generatedObject = null;

      for (const output of response.output || []) {
        if (output.type === 'message' && output.role === 'assistant') {
          for (const content of output.content || []) {
            if (content.type === 'output_text') {
              generatedObject = JSON.parse(content.text);

              // Handle wrapped results (same as before)
              if (generatedObject.___results) {
                generatedObject = generatedObject.___results;
              }
              break;
            }
          }
        }
      }

      if (!generatedObject) {
        throw new Error('No structured output generated');
      }

      // Build updated messages for compatibility
      const updatedMessages = [...messages, {
        role: "assistant",
        content: JSON.stringify(generatedObject)
      }];

      return {
        response: generatedObject,
        messages: updatedMessages
      } as LLMObjectResponse;
    } catch (error) {
      console.error('Error in generateObject with Responses API:', error);
      // Fall back to chat completions API
      const responseFormat = schema ? { type: "json_schema", json_schema: { name: "response", strict: true, schema: schema } } : { type: "json_object" };
      const result = await this.model.chat.completions.create({
        messages: [dateMessage as ChatCompletionMessageParam, ...messages],
        model: process.env.OPENAI_MODEL || "gpt-4o",
        temperature: process.env.OPENAI_MODEL?.startsWith('o') ? undefined : temperature,
        response_format: responseFormat as any,
      });

      let responseText = result.choices[0].message.content;
      let generatedObject = JSON.parse(responseText);
      if (generatedObject.___results) {
        generatedObject = generatedObject.___results;
      }

      const updatedMessages = [...messages, {
        role: "assistant",
        content: responseText
      }];

      return {
        response: generatedObject,
        messages: updatedMessages
      } as LLMObjectResponse;
    }
  }

  async executeTaskWithTools(
    messages: ChatCompletionMessageParam[],
    tools: ToolDefinition[],
    toolExecutor: (toolCall: ToolCall) => Promise<ToolResult>,
    options?: { maxIterations?: number; temperature?: number; previousResponseId?: string; shouldAbort?: (trace: { toolCall: ToolCall; result: ToolResult }) => boolean; }
  ): Promise<LLMAutonomousResponse> {
    // Build stateless response input
    let input: any[] = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    }));

    // Add system message for agentic behavior (as recommended in docs)
    const agenticSystemMessage = {
      role: 'system',
      content: AGENTIC_SYSTEM_PROMPT
    };

    // Prepend agentic instructions
    input.unshift(agenticSystemMessage);

    const fnTools = tools.map(t => ({
      type: 'function' as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));

    const executionTrace: LLMAutonomousResponse['executionTrace'] = [];
    const toolCalls: ToolCall[] = [];
    const maxIterations = options?.maxIterations ?? 10;
    const temperature = options?.temperature ?? 0.2;

    let responseId: string | null = options?.previousResponseId || null;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await (this.model.responses.create as any)({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        input: input as any,
        tools: fnTools as any,
        tool_choice: "auto",
        temperature,
        previous_response_id: responseId,
        store: true,
        parallel_tool_calls: true
      });

      responseId = response.id;
      let hasToolCalls = false;
      let finalText = '';

      for (const output of response.output || []) {
        if (output.type === 'function_call') {
          hasToolCalls = true;
          const toolCall: ToolCall = {
            id: output.call_id || output.id,
            name: output.name,
            arguments: JSON.parse(output.arguments)
          };
          toolCalls.push(toolCall);

          const result = await toolExecutor(toolCall);
          executionTrace.push({ toolCall, result });

          input.push({
            type: 'function_call_output',
            call_id: toolCall.id,
            output: typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
          });

          if (options?.shouldAbort?.({ toolCall, result })) {
            return { finalResult: "Execution aborted by caller.", toolCalls, executionTrace, messages: input as any, responseId };
          }
        } else if (output.type === 'message') {
            finalText = output.content?.map(c => c.text).join('') || '';
        }
      }

      if (!hasToolCalls && response.finish_reason === 'stop') {
        return { finalResult: finalText, toolCalls, executionTrace, messages: input as any, responseId };
      }
    }

    throw new Error(`Maximum iterations (${maxIterations}) reached in executeTaskWithTools`);
  }

  extractLastSuccessfulToolResult(
    toolName: string,
    executionTrace: LLMAutonomousResponse['executionTrace']
  ): any | null {
    // Find all calls to the specified tool
    const toolCalls = executionTrace.filter(step => step.toolCall.name === toolName);

    if (toolCalls.length === 0) {
      return null;
    }

    // Iterate in reverse to find the last successful call
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const { result } = toolCalls[i];

      // Check if the tool execution was successful (no error)
      if (!result.error && result.result) {
        // For tools that return {success: boolean, ...data}, check success flag
        if (typeof result.result === 'object' && 'success' in result.result) {
          if (result.result.success) {
            return result.result;
          }
        } else {
          // For tools that don't use success flag, presence of result without error means success
          return result.result;
        }
      }
    }

    return null;
  }
}


import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMAutonomousResponse, LLMObjectResponse, LLMResponse, LLMToolResponse, ToolCall, ToolDefinition, ToolResult } from "./llm.js";


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
      // Use JSON mode without schema validation
      textFormat = {
        format: {
          type: "json_object"
        }
      };
    }

    try {
      // Call Responses API with appropriate format
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

  async executeTool(
    messages: ChatCompletionMessageParam[],
    tools: ToolDefinition[],
    temperature: number = 0.2,
    forceToolUse: boolean = false,
    previousResponseId?: string
  ): Promise<LLMToolResponse> {
    // Prepare input messages for Responses API
    const input = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    }));

    // Prepare tools in the Responses API format
    const fnTools = tools.map(t => ({
      type: 'function' as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));

    try {
      // Call Responses API with tool_choice set to "required" to force a tool call
      const response = await (this.model.responses.create as any)({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        input: input as any,
        tools: fnTools as any,
        tool_choice: forceToolUse ? "required" : "auto",  // Use forceToolUse parameter
        temperature,
        previous_response_id: previousResponseId,  // Use for conversation continuity
        store: true  // Store for conversation continuity
      }) as any;

      // Extract function call from output array
      const functionCall = response.output?.find((item: any) => item.type === 'function_call');

      // Also extract any text response
      let textResponse: string | undefined;
      for (const output of response.output || []) {
        if (output.type === 'message' && output.role === 'assistant') {
          for (const content of output.content || []) {
            if (content.type === 'output_text') {
              textResponse = (textResponse || '') + content.text;
            }
          }
        }
      }

      // Parse arguments and create ToolCall if function was called
      const toolCall = functionCall ? {
        id: functionCall.call_id || functionCall.id,
        name: functionCall.name,
        arguments: JSON.parse(functionCall.arguments)
      } : null;

      // Return response with the response ID for potential continuation
      return {
        toolCall,
        textResponse,
        messages,
        responseId: response.id  // Include response ID for continuation
      };
    } catch (error) {
      console.error('Error in executeTool:', error);
      throw error;
    }
  }

  async executeTaskWithTools(
    messages: ChatCompletionMessageParam[],
    tools: ToolDefinition[],
    toolExecutor: (toolCall: ToolCall) => Promise<ToolResult>,
    options?: { maxIterations?: number; temperature?: number; previousResponseId?: string; }
  ): Promise<LLMAutonomousResponse> {
    // Build stateless response input
    let input: any[] = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    }));

    // Add system message for agentic behavior (as recommended in docs)
    const agenticSystemMessage = {
      role: 'system',
      content: `You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved.

If you are not sure about something, use your tools to gather the relevant information: do NOT guess or make up an answer.

You MUST plan extensively before each function call, and reflect extensively on the outcomes of the previous function calls.`
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
      try {
        // Call Responses API with stateless conversation management
        const response = await (this.model.responses.create as any)({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          input: input as any,
          tools: fnTools as any,
          tool_choice: "auto",  // Let model decide when to call tools
          temperature,
          previous_response_id: responseId,  // Use for conversation continuity
          store: true,  // Store for multi-turn conversations
          parallel_tool_calls: true  // Allow multiple tool calls in one turn
        }) as any;

        responseId = response.id;

        // Process all outputs
        let hasToolCalls = false;
        let finalText = '';

        for (const output of response.output || []) {
          if (output.type === 'function_call') {
            hasToolCalls = true;

            // Parse arguments and create ToolCall
            const toolCall: ToolCall = {
              id: output.call_id || output.id,
              name: output.name,
              arguments: JSON.parse(output.arguments)
            };

            toolCalls.push(toolCall);

            // Execute the tool
            const result = await toolExecutor(toolCall);
            executionTrace.push({ toolCall, result });

            // Add function call output to input
            input.push({
              type: 'function_call_output',
              call_id: toolCall.id,
              output: typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
            });
          } else if (output.type === 'message' && output.role === 'assistant') {
            // Extract text from assistant message
            for (const content of output.content || []) {
              if (content.type === 'output_text') {
                finalText += content.text;
              }
            }
          }
        }

        // If no tool calls were made, we have our final response
        if (!hasToolCalls && finalText) {
          return {
            finalResult: finalText,
            toolCalls,
            executionTrace,
            messages: input as any,
            responseId  // Include final response ID for continuation
          };
        }

        // If we had tool calls but no more iterations, continue to next iteration
        if (!hasToolCalls && !finalText) {
          // Model didn't produce any output - this is unexpected
          throw new Error('Model produced no output');
        }
      } catch (error) {
        console.error(`Error in iteration ${iteration}:`, error);
        throw error;
      }
    }

    // Max iterations reached
    throw new Error(`Maximum iterations (${maxIterations}) reached in executeTaskWithTools`);
  }
}


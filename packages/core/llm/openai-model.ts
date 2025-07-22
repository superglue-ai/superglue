import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { ToolCall, ToolCallResult, ToolDefinition } from "../tools/tools.js";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMAutonomousResponse, LLMObjectResponse, LLMResponse } from "./llm.js";


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
    toolExecutor: (toolCall: ToolCall) => Promise<ToolCallResult>,
    options?: { maxIterations?: number; temperature?: number; previousResponseId?: string; shouldAbort?: (trace: { toolCall: ToolCall; result: ToolCallResult }) => boolean; }
  ): Promise<LLMAutonomousResponse> {
    let responseId: string | null = null;

    const fnTools = tools.map(t => ({
      type: 'function' as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));

    const executionTrace: LLMAutonomousResponse['executionTrace'] = [];
    const toolCalls: ToolCall[] = [];
    const maxIterations = options?.maxIterations ?? 10;
    const temperature = options?.temperature ?? 0.1;

    let lastAssistantText: string | null = null;

    for (let i = 0; i < maxIterations; i++) {
      const resp = await (this.model.responses.create as any)({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        input: messages,
        previous_response_id: responseId ?? undefined,
        tools: fnTools, 
        tool_choice: "required",
        temperature: temperature,
        parallel_tool_calls: false,
        store: true,
      }, { timeout: 60_000 });

      responseId = resp.id;

      for (const out of resp.output || []) {
        if (out.type === "function_call") {
          const call: ToolCall = {
            id: out.call_id || out.id,
            name: out.name,
            arguments: JSON.parse(out.arguments)
          };

          toolCalls.push(call);
          const result = await toolExecutor(call);
          executionTrace.push({ toolCall: call, result });

          const truncatedResultForAgent = JSON.stringify(result.result?.resultForAgent ?? null).slice(0, 4_000);
          const msg = { type: "function_call_output", call_id: call.id, output: 'Output truncated to 4000 chars: ' + truncatedResultForAgent };
          messages.push(msg as any);

          if (options?.shouldAbort?.({ toolCall: call, result })) {
            if (lastAssistantText) {
              messages.push({ role: "assistant", content: lastAssistantText } as any);
            }
            return { finalResult: lastAssistantText ?? "aborted", toolCalls, executionTrace, messages: messages, responseId };
          }
        } else if (out.type === "message") {
          lastAssistantText = out.content?.map(c => c.text).join("") || "";
        }
      }

      if (!resp.output?.some(o => o.type === "function_call")) {
        if (lastAssistantText) {
          messages.push({ role: "assistant", content: lastAssistantText } as any);
        }
        return { finalResult: lastAssistantText ?? "", toolCalls, executionTrace, messages: messages, responseId };
      }
    }
    throw new Error(`Maximum iterations (${maxIterations}) reached in executeTaskWithTools`);
  }


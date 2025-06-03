import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";


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
    // o models don't support temperature
    if (process.env.OPENAI_MODEL?.startsWith('o')) {
      temperature = undefined;
    }
    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    } as ChatCompletionMessageParam;

    const result = await this.model.chat.completions.create({
      messages: [dateMessage, ...messages],
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: temperature,
      max_tokens: 65536,
    });
    let responseText = result.choices[0].message.content;

    // Add response to messages history
    const updatedMessages = [...messages, {
      role: "assistant",
      content: responseText
    }];

    return {
      response: responseText,
      messages: updatedMessages
    } as LLMResponse;
  }

  private enforceStrictSchema(schema: any, isRoot: boolean) {
    if (!schema || typeof schema !== 'object') return schema;

    // wrap non-object in object with ___results key
    if (isRoot && schema.type !== 'object') {
      schema = {
        type: 'object',
        properties: {
          ___results: schema,
        },
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
    // Recursively set additionalProperties: false for all object properties
    schema = addNullableToOptional(schema)
    schema = this.enforceStrictSchema(schema, true);
    // o models don't support temperature
    if (process.env.OPENAI_MODEL?.startsWith('o')) {
      temperature = undefined;
    }
    const responseFormat = schema ? { type: "json_schema", json_schema: { name: "response", strict: true, schema: schema } } : { type: "json_object" };
    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    } as ChatCompletionMessageParam;
    const result = await this.model.chat.completions.create({
      messages: [dateMessage, ...messages],
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: temperature,
      response_format: responseFormat as any,
    });
    let responseText = result.choices[0].message.content;

    let generatedObject = JSON.parse(responseText);
    if (generatedObject.___results) {
      generatedObject = generatedObject.___results;
    }

    // Add response to messages history
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


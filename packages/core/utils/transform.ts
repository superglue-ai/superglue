import { OpenAI } from "@posthog/ai";
import type { DataStore, TransformConfig, TransformInput } from "@superglue/shared";
import { createHash } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import toJsonSchema from "to-json-schema";
import { PROMPT_MAPPING } from "./prompts.js";
import { telemetryClient } from "./telemetry.js";
import { applyJsonataWithValidation, getSchemaFromData, sample } from "./tools.js";

export async function prepareTransform(
    datastore: DataStore,
    fromCache: boolean,
    input: TransformInput,
    data: any,
    orgId?: string
  ): Promise<TransformConfig | null> {

    // Check if the response schema is empty
    if(!input?.responseSchema || 
      Object.keys(input.responseSchema).length === 0) {
      return null;
    }

    // Check if the data is empty
    if(!data || 
      (Array.isArray(data) && data.length === 0) || 
      (typeof data === 'object' && Object.keys(data).length === 0)) {
      return null;
    }

    // Check if the transform config is cached
    if(fromCache) {
      const cached = await datastore.getTransformConfigFromRequest(input as TransformInput, data, orgId);
      if (cached) return { ...cached, ...input };
    }

    const hash = createHash('md5')
      .update(JSON.stringify({request: input, payloadKeys: getSchemaFromData(data)}))
      .digest('hex');

    if(input.responseMapping) {
      return { 
        id: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
        responseMapping: input.responseMapping,
        responseSchema: input.responseSchema,
        ...input
      };
    }

    // Generate the response mapping
    const mapping = await generateMapping(input.responseSchema, data, input.instruction);

    // Check if the mapping is generated successfully
    if(mapping) {
      return { 
        id: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input, 
        responseSchema: input.responseSchema,
        responseMapping: mapping.jsonata,
        confidence: mapping.confidence,
        confidence_reasoning: mapping.confidence_reasoning
      };
    }
    return null;
  } 

export async function generateMapping(schema: any, payload: any, instruction?: string, retry = 0, messages?: ChatCompletionMessageParam[]): Promise<{jsonata: string, confidence: number, confidence_reasoning: string} | null> {
  console.log(`Generating mapping${retry ? `: (retry ${retry})` : ""}`);
  try {
    const openaiConfig: any = {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_BASE_URL,
      posthog: telemetryClient
    };
    const openai = new OpenAI(openaiConfig);

    const userPrompt = 
`Given a source data and structure, create a jsonata expression in JSON FORMAT.

Important: The output should be a jsonata expression creating an object that matches the following schema:
${JSON.stringify(schema, null, 2)}

${instruction ? `The instruction from the user is: ${instruction}` : ''}

------

Source Data Structure:
${JSON.stringify(toJsonSchema(payload, {required: true,arrays: {mode: 'first'}}), null, 2)}

Source data Sample:
${JSON.stringify(sample(payload, 2), null, 2).slice(0,30000)}`

    if(!messages) {
      messages = [
        {role: "system", content: PROMPT_MAPPING},
        {role: "user", content: userPrompt}
      ]
    }
    const temperature = String(process.env.OPENAI_MODEL).startsWith("o") ? undefined : Math.min(retry * 0.1, 1);
  
    const reasoning = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      temperature,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "required_format",
          schema: jsonataSchema,
        }
      },
    });

    const assistantResponse = String(reasoning.choices[0].message.content);
    messages.push({role: "assistant", content: assistantResponse});
    const content = JSON.parse(assistantResponse);
    console.log("generated mapping", content?.jsonata);
    const transformation = await applyJsonataWithValidation(payload, content.jsonata, schema);

    if(!transformation.success) {
      console.log("validation failed", String(transformation?.error).substring(0, 100));
      throw new Error(`Validation failed: ${transformation.error}`);
    }

    console.log("validation succeeded");
    // Unwrap the data property
    return content;

  } catch (error) {
      if(retry < 5) {
        messages.push({role: "user", content: error.message});
        return generateMapping(schema, payload, instruction, retry + 1, messages);
      }
      console.error('Error generating mapping:', String(error));
  }
  return null;
}


const jsonataSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JSONata Expression Schema",
  "description": "Schema for validating JSONata expressions",
  "type": "object",
  "properties": {
    "jsonata": {
      "type": "string",
      "description": "JSONata expression"
    },
    "confidence": {
      "type": "number",
      "description": `Confidence score for the JSONata expression between 0 and 100. 
      Give a low confidence score if there are missing fields in the source data. 
      Give a low confidence score if there are multiple options for a field and it is unclear which one to choose.
      `,
    },
    "confidence_reasoning": {
      "type": "string",
      "description": "Reasoning for the confidence score"
    }
  },
  "required": ["jsonata", "confidence", "confidence_reasoning"],
  "additionalProperties": false
}
import type { DataStore, Metadata, TransformConfig, TransformInput } from "@superglue/shared";
import { createHash } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { PROMPT_MAPPING } from "../llm/prompts.js";
import { applyJsonataWithValidation, getSchemaFromData, sample } from "./tools.js";
import { logMessage } from "./logs.js";
import { LanguageModel } from "../llm/llm.js";

export async function prepareTransform(
    datastore: DataStore,
    fromCache: boolean,
    input: TransformInput,
    data: any,
    lastError: string | null,
    metadata: Metadata
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
      const cached = await datastore.getTransformConfigFromRequest(input as TransformInput, data, metadata.orgId);
      if (cached) return { ...cached, ...input };
    }

    const hash = createHash('md5')
      .update(JSON.stringify({request: input, payloadKeys: getSchemaFromData(data)}))
      .digest('hex');

    if(input.responseMapping && !lastError) {
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
    const mapping = await generateMapping(input.responseSchema, data, input.instruction, metadata);

    // Check if the mapping is generated successfully
    if(mapping) {
      return { 
        id: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input, 
        responseSchema: input.responseSchema,
        responseMapping: mapping.jsonata,
        confidence: mapping.confidence
      };
    }
    return null;
  } 

export async function generateMapping(schema: any, payload: any, instruction: string, metadata: Metadata, retry = 0, messages?: ChatCompletionMessageParam[]): Promise<{jsonata: string, confidence: number} | null> {
  try {
    logMessage('info', "Generating mapping" + (retry > 0 ? ` (retry ${retry})` : ''), metadata);
    const userPrompt = 
`Given a source data and structure, create a jsonata expression in JSON FORMAT.

Important: The output should be a jsonata expression creating an object that matches the following schema:
${JSON.stringify(schema, null, 2)}

${instruction ? `The instruction from the user is: ${instruction}` : ''}

------

Source Data Structure:
${getSchemaFromData(payload)}

Source data Sample:
${JSON.stringify(sample(payload, 2), null, 2).slice(0,30000)}`

    if(!messages) {
      messages = [
        {role: "system", content: PROMPT_MAPPING},
        {role: "user", content: userPrompt}
      ]
    }
    const temperature = Math.min(retry * 0.1, 1);
    
    const { response, messages: updatedMessages } = await LanguageModel.generateObject(messages, jsonataSchema, temperature);
    messages = updatedMessages;
    const transformation = await applyJsonataWithValidation(payload, response.jsonata, schema);

    if(!transformation.success) {
      throw new Error(`Validation failed: ${transformation.error}`);
    }
    return response;
  } catch (error) {
      if(retry < 8) {
        const errorMessage = String(error.message);
        logMessage('warn', "Error generating mapping: " + errorMessage.slice(0, 200), metadata);
        messages.push({role: "user", content: errorMessage});
        return generateMapping(schema, payload, instruction, metadata, retry + 1, messages);
      }
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
    }
  },
  "required": ["jsonata", "confidence"],
  "additionalProperties": false
}
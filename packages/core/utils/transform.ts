import type { DataStore, Metadata, TransformConfig } from "@superglue/shared";
import { createHash } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { PROMPT_MAPPING } from "../llm/prompts.js";
import { applyJsonataWithValidation, getSchemaFromData, sample } from "./tools.js";
import { logMessage } from "./logs.js";
import { LanguageModel } from "../llm/llm.js";

export async function prepareTransform(
    datastore: DataStore,
    fromCache: boolean,
    input: TransformConfig,
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
    if(fromCache && datastore) {
      const cached = await datastore.getTransformConfig(input.id, metadata.orgId);
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

    if(retry > 0) {
      const evaluation = await evaluateMapping(transformation.data, payload, schema, instruction, metadata);
      if(!evaluation.success) {
        throw new Error(`Mapping evaluation failed: ${evaluation.reason}`);
      }
    }
    return response;
  } catch (error) {
      if(retry < 8) {
        const errorMessage = String(error.message);
        logMessage('warn', "Error generating mapping: " + errorMessage.slice(0, 250), metadata);
        messages.push({role: "user", content: errorMessage});
        return generateMapping(schema, payload, instruction, metadata, retry + 1, messages);
      }
  }
  return null;
}

export async function evaluateMapping(
  transformedData: any,
  sourcePayload: any,
  targetSchema: any,
  instruction: string,
  metadata: Metadata
): Promise<{ success: boolean; reason: string }> {
  try {
    logMessage('info', "Evaluating mapping", metadata);

    const systemPrompt = `You are a data transformation evaluator. Your task is to assess if the 'transformedData' is a correct and high-quality transformation of the 'sourcePayload' according to the 'targetSchema'.
${instruction ? `The user's original instruction for the transformation was: "${instruction}"` : 'No specific transformation instruction was provided by the user; focus on accurately mapping source data to the target schema.'}
Return { success: true, reason: "Transformation is correct, complete, and aligns with the objectives." } if the transformed data accurately reflects the source data, matches the target schema, and (if provided) adheres to the user's instruction.
If the transformation is incorrect, incomplete, introduces errors, misses crucial data from the source payload that could map to the target schema, or (if an instruction was provided) fails to follow it, return { success: false, reason: "Describe the issue with the transformation, specifically referencing how it deviates from the schema or instruction." }.
Consider if all relevant parts of the sourcePayload have been used to populate the targetSchema where applicable.
If the transformedData is empty or missing key fields, but the sourcePayload is not, this is likely an issue unless the targetSchema itself implies an empty object/missing fields are valid under certain source conditions.
Focus on data accuracy and completeness of the mapping, and adherence to the instruction if provided.`;

    const userPrompt = `Target Schema:
${JSON.stringify(targetSchema, null, 2)}

Source Payload Sample (first 2 elements/entries, max 10KB):
${JSON.stringify(sample(sourcePayload, 2), null, 2).slice(0, 10000)}

Transformed Data:
${JSON.stringify(transformedData, null, 2)}

Please evaluate the transformation based on the criteria mentioned in the system prompt.`;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const llmResponseSchema = {
      type: "object",
      properties: {
        success: { type: "boolean", description: "True if the mapping is good, false otherwise." },
        reason: { type: "string", description: "Reasoning for the success status. If success is false, explain what is wrong with the mapping. If success is true, confirm correct transformation." }
      },
      required: ["success", "reason"],
      additionalProperties: false
    };

    // Using temperature 0 for more deterministic evaluation
    const { response } = await LanguageModel.generateObject(messages, llmResponseSchema, 0); 

    return response;

  } catch (error) {
    const errorMessage = String(error instanceof Error ? error.message : error);
    logMessage('error', `Error evaluating mapping: ${errorMessage.slice(0,250)}`, metadata);
    return { success: false, reason: `Error during evaluation: ${errorMessage}` };
  }
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
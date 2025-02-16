import OpenAI from "openai";
import { PROMPT_MAPPING } from "./prompts.js";
import {  applyJsonataWithValidation, sample } from "./tools.js";
import { ApiInput, DataStore, TransformConfig, TransformInput } from "@superglue/shared";
import crypto from 'crypto';
import toJsonSchema from "to-json-schema";

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

    // Check if the response mapping is already generated
    if(input.responseMapping) {
      return { 
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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

export async function generateMapping(schema: any, payload: any, instruction?: string, retry = 0, error?: string): Promise<{jsonata: string, confidence: number, confidence_reasoning: string} | null> {
  console.log("generating mapping from schema");
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const userPrompt = 
`

Given the following source data and structure, create a jsonata expression in JSON FORMAT:

Source data:
${JSON.stringify(sample(payload), null, 2).slice(0,2000)}

Structure:
${JSON.stringify(toJsonSchema(payload, {required: true,arrays: {mode: 'first'}}), null, 2)}

------

The output should be a jsonata expression with the following schema:
${JSON.stringify(schema, null, 2)}

${error ? `We tried to generate the jsonata expression, but it failed with the following error: ${error}` : ''}

${instruction ? `The instruction to get the source data was: ${instruction}` : ''}
`
    const reasoning = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: PROMPT_MAPPING
        },
        {
          role: "user", 
          content: userPrompt
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "required_format",
          schema: jsonataSchema,
        }
      },
    });

    const contentJson = String(reasoning.choices[0].message.content);  
    const content = JSON.parse(contentJson);

    const transformation = await applyJsonataWithValidation(payload, content.jsonata, schema);

    if(!transformation.success) {
      console.log("validation failed", String(transformation?.error).substring(0, 100));
      throw new Error(
        `Validation failed:
        ${transformation.error}
        
        The mapping we used before: 
        ${content.jsonata}

        The reasoning:
        ${content.confidence_reasoning}
        `);
    }

    console.log("validation succeeded", content?.jsonata);
    // Unwrap the data property
    return content;

  } catch (error) {
      console.error('Error generating mapping:', error);
      if(retry < 10) {
          console.log("retrying mapping generation, retry count: " + retry);
          return generateMapping(schema, payload, instruction, retry + 1, error);
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
    },
    "confidence_reasoning": {
      "type": "string",
      "description": "Reasoning for the confidence score"
    }
  },
  "required": ["jsonata", "confidence", "confidence_reasoning"],
  "additionalProperties": false
}
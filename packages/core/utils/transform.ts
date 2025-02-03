import OpenAI from "openai";
import { PROMPT_MAPPING } from "./prompts.js";
import {  applyJsonataWithValidation, sample } from "./tools.js";
import { ApiInput, DataStore, TransformConfig, TransformInput } from "@superglue/shared";
import crypto from 'crypto';

export async function prepareTransform(
    datastore: DataStore,
    fromCache: boolean,
    input: ApiInput | TransformInput,
    data: any
  ): Promise<TransformConfig | null> {
    if(!input.responseSchema || JSON.stringify(input.responseSchema) === '{}') {
      return null;
    }

    if(fromCache) {
      const cached = await datastore.getTransformConfigFromRequest(input as TransformInput, data);
      if (cached) return { ...cached, ...input };
    }
    
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
    const mapping = await generateMapping(input.responseSchema, data);

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

export async function generateMapping(schema: any, payload: any, retry = 0, error?: string): Promise<{jsonata: string, confidence: number, confidence_reasoning: string} | null> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("generating mapping", schema);
    const userPrompt = 
`

Given the following source data, create a jsonata expression in JSON FORMAT:

${JSON.stringify(sample(payload), null, 2).slice(0,10000)}

------

The output should be a jsonata expression with the following schema:
${JSON.stringify(schema, null, 2)}

${error ? `We tried to generate the jsonata expression, but it failed with the following error:
${error}
` : ''}
`
    const reasoning = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      temperature: 0.6,
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
      console.log("validation failed", transformation.error);
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
      if(retry < 2) {
          console.log("retrying mapping generation, retry count: " + retry);
          return generateMapping(schema, payload, retry + 1, error);
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
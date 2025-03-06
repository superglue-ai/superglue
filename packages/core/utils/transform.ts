import { PROMPT_MAPPING } from "./prompts.js";
import {  applyJsonataWithValidation, getSchemaFromData, sample } from "./tools.js";
import { DataStore, TransformConfig, TransformInput } from "@superglue/shared";
import { createHash } from "crypto";
import toJsonSchema from "to-json-schema";
import { z } from "zod";
import { CoreMessage } from 'ai';
import LLMClient from "./llm.js";


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

export async function generateMapping(schema: any, payload: any, instruction?: string, retry = 0, messages?: Array<CoreMessage>): Promise<{jsonata: string, confidence: number, confidence_reasoning: string} | null> {
  console.log("generating mapping" + (retry ? `, attempt ${retry} with temperature ${retry * 0.1}` : ""));
  try {

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
    const temperature = Math.min(retry * 0.1, 1);
  
    const reasoning = await LLMClient.getInstance().getObject({
      schema: zodSchema,
      schemaName: "mapping_definition",
      temperature:temperature,
      messages:messages
    });
        
    messages.push({role: "assistant", content:  JSON.stringify(reasoning)});

    console.log("generated mapping", reasoning?.jsonata);
    const transformation = await applyJsonataWithValidation(payload, reasoning?.jsonata, schema);

    if(!transformation.success) {
      console.log("validation failed", String(transformation?.error).substring(0, 100));
      throw new Error(`Validation failed: ${transformation.error}`);
    }

    console.log("validation succeeded");
    
    return reasoning;

  } catch (error) {
      if(retry < 5) {
        messages.push({role: "user", content: error.message});
        return generateMapping(schema, payload, instruction, retry + 1, messages);
      }
      console.error('Error generating mapping:', String(error));
  }
  return null;
}


const zodSchema = z.object({
  jsonata: z.string().describe("JSONata expression"),
  confidence: z.number().describe("Confidence score for the JSONata expression between 0 and 100. Give a low confidence score if there are missing fields in the source data. Give a low confidence score if there are multiple options for a field and it is unclear which one to choose."),
  confidence_reasoning: z.string().describe("Reasoning for the confidence score"),
}).strict();
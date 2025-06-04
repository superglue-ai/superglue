import { RequestOptions, SelfHealingMode, TransformConfig, TransformInputRequest } from "@superglue/client";
import type { DataStore, Metadata } from "@superglue/shared";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import prettier from "prettier";
import { LanguageModel } from "../llm/llm.js";
import { PROMPT_JS_TRANSFORM, PROMPT_MAPPING } from "../llm/prompts.js";
import { logMessage } from "./logs.js";
import { applyTransformationWithValidation, getSchemaFromData, sample } from "./tools.js";

export async function executeTransform(args: {
  datastore: DataStore,
  fromCache: boolean,
  input: TransformInputRequest,
  data: any,
  options?: RequestOptions,
  metadata: Metadata
}): Promise<{ data?: any; config?: TransformConfig }> {
  const { datastore, fromCache, input, data, metadata, options } = args;
  let currentConfig = input.endpoint;
  if (fromCache && datastore) {
    const cached = await datastore.getTransformConfig(input.id || input.endpoint.id, metadata.orgId);
    if (cached) {
      currentConfig = { ...cached, ...input.endpoint };
    }
  }
  if (!currentConfig) {
    throw new Error("No transform config found");
  }

  try {
    if (!currentConfig?.responseMapping) {
      throw new Error("No response mapping found");
    }

    const transformResult = await applyTransformationWithValidation(
      data,
      currentConfig.responseMapping,
      currentConfig.responseSchema
    );

    if (!transformResult.success) {
      throw new Error(transformResult.error);
    }

    return {
      data: transformResult.data,
      config: currentConfig
    };
  } catch (error) {
    const rawErrorString = error?.message || JSON.stringify(error || {});
    const transformError = rawErrorString.slice(0, 200);
    let instruction = currentConfig.instruction;
    if (transformError && currentConfig.responseMapping) {
      instruction = `${instruction}\n\nThe previous error was: ${transformError} for the following mapping: ${currentConfig.responseMapping}`;
    }

    // if the transform is not self healing and there is an existing mapping, throw an error
    // if there is no mapping that means that the config is being generated for the first time and should generate regardless
    if (currentConfig.responseMapping && !isSelfHealing(options)) {
      throw new Error(transformError);
    }

    const result = await generateTransformCode(
      currentConfig.responseSchema,
      data,
      instruction,
      metadata
    );

    if (!result || !result?.mappingCode) {
      throw new Error("Failed to generate transformation mapping");
    }

    currentConfig = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...currentConfig,
      responseMapping: result.mappingCode
    };

    return {
      data: result.data,
      config: currentConfig
    };
  }
}

function isSelfHealing(options: RequestOptions): boolean {
  return options?.selfHealing ? options.selfHealing === SelfHealingMode.ENABLED || options.selfHealing === SelfHealingMode.TRANSFORM_ONLY : true;
}

export async function generateTransformJsonata(schema: any, payload: any, instruction: string, metadata: Metadata, retry = 0, messages?: ChatCompletionMessageParam[]): Promise<{ jsonata: string, confidence: number } | null> {
  try {
    logMessage('info', "Generating mapping" + (retry > 0 ? ` (retry ${retry})` : ''), metadata);
    const userPrompt =
      `Given a source data and structure, create a jsonata expression in JSON FORMAT.
  
  Important: The output should be a jsonata expression creating an object that exactly matches the following schema:
  ${JSON.stringify(schema, null, 2)}
  
  ${instruction ? `The instruction from the user is: ${instruction}` : ''}
  
  ------
  
  Source Data Structure:
  ${getSchemaFromData(payload)}
  
  Source data Sample:
  ${JSON.stringify(sample(payload, 2), null, 2).slice(0, 50000)}`

    if (!messages) {
      messages = [
        { role: "system", content: PROMPT_MAPPING },
        { role: "user", content: userPrompt }
      ]
    }
    const temperature = Math.min(retry * 0.1, 1);

    const { response, messages: updatedMessages } = await LanguageModel.generateObject(messages, jsonataSchema, temperature);
    messages = updatedMessages;
    const transformation = await applyTransformationWithValidation(payload, response.jsonata, schema);

    if (!transformation.success) {
      throw new Error(`Validation failed: ${transformation.error}`);
    }
    const evaluation = await evaluateMapping(transformation.data, response.jsonata, payload, schema, instruction, metadata);
    if (!evaluation.success) {
      throw new Error(`Mapping evaluation failed: ${evaluation.reason}`);
    }
    return response;
  } catch (error) {
    if (retry < 8) {
      const errorMessage = String(error.message);
      logMessage('warn', "Error generating mapping: " + errorMessage.slice(0, 250), metadata);
      messages.push({ role: "user", content: errorMessage });
      return generateTransformJsonata(schema, payload, instruction, metadata, retry + 1, messages);
    }
  }
  return null;
}

export async function generateTransformCode(
  schema: any,
  payload: any,
  instruction: string,
  metadata: Metadata,
  retry = 0,
  messages?: ChatCompletionMessageParam[]
): Promise<{ mappingCode: string, confidence: number, data?: any } | null> {
  try {
    logMessage('info', "Generating mapping" + (retry > 0 ? ` (retry ${retry})` : ''), metadata);

    if (!messages || messages?.length === 0) {
      const userPrompt =
        `Given a source data and structure, create a JavaScript function (as a string) that transforms the input data to exactly match the following schema:
${JSON.stringify(schema, null, 2)}

${instruction ? `The instruction from the user is: ${instruction}` : ''}

------
Source Data Structure:
${getSchemaFromData(payload)}

Source data Sample:
${JSON.stringify(sample(payload, 2), null, 2).slice(0, 50000)}
`;
      messages = [
        { role: "system", content: PROMPT_JS_TRANSFORM },
        { role: "user", content: userPrompt }
      ];
    }
    const temperature = Math.min(retry * 0.1, 1);

    // Schema for the expected LLM response
    const mappingSchema = {
      type: "object",
      properties: {
        mappingCode: { type: "string", description: "JS function as string" },
        confidence: { type: "number", description: "Confidence score 0-100" }
      },
      required: ["mappingCode", "confidence"],
      additionalProperties: false
    };

    const { response, messages: updatedMessages } = await LanguageModel.generateObject(messages, mappingSchema, temperature);
    messages = updatedMessages;
    try {
      // Autoformat the generated code
      response.mappingCode = await prettier.format(response.mappingCode, { parser: "babel" });
      const validation = await applyTransformationWithValidation(payload, response.mappingCode, schema);
      if (!validation.success) {
        throw new Error(`Validation failed: ${validation.error}`);
      }
      response.data = validation.data;
    } catch (err) {
      throw new Error(`Generated code is invalid JS: ${err.message}`);
    }

    // Optionally, evaluate mapping quality as before
    const evaluation = await evaluateMapping(response.data, response.mappingCode, payload, schema, instruction, metadata);
    if (!evaluation.success) {
      throw new Error(`Mapping evaluation failed: ${evaluation.reason}`);
    }
    logMessage('info', `Mapping generated successfully with ${response.confidence}% confidence`, metadata);
    return response;
  } catch (error) {
    if (retry < 10) {
      const errorMessage = String(error.message);
      logMessage('warn', "Error generating JS mapping: " + errorMessage.slice(0, 250), metadata);
      messages?.push({ role: "user", content: errorMessage });
      return generateTransformCode(schema, payload, instruction, metadata, retry + 1, messages);
    }
  }
  return null;
}

export async function evaluateMapping(
  transformedData: any,
  mappingCode: string,
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
Focus on data accuracy and completeness of the mapping, and adherence to the instruction if provided.
Keep in mind that you only get a sample of the source data and the transformed data. Samples mean that each array is randomized and reduced to the first 5 entries. If in doubt, check the mapping code. If that is correct, all is good.
So, do NOT fail the evaluation if the arrays in the transformed data are different from the source data but the code is correct, look at the STRUCTURE of the data.
Also, if data is missing from the transformed data it is not an issue, as long as the field is not required in the target schema. Be particularly lenient with arrays since the data might be sampled out.
`;
    const userPrompt = `Target Schema:
${JSON.stringify(targetSchema, null, 2)}

Source Payload Sample (arrays are randomized and reduced to the first 5 entries, max 10KB):
${JSON.stringify(sample(sourcePayload, 5), null, 2).slice(0, 50000)}

Transformed Data Sample (arrays are randomized and reduced to the first 5 entries, max 10KB):
${JSON.stringify(sample(transformedData, 5), null, 2).slice(0, 50000)}

Please evaluate the transformation based on the criteria mentioned in the system prompt. 

Here is the mapping code that was used to transform the data:
${mappingCode}
`;

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
    logMessage('error', `Error evaluating mapping: ${errorMessage.slice(0, 250)}`, metadata);
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
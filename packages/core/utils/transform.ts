import { BaseConfig, JSONata, JSONSchema, RequestOptions } from "@superglue/client";
import type { DataStore, Metadata } from "@superglue/shared";
import prettier from "prettier";
import { getEvaluateTransformContext, getTransformContext } from "../context/context-builders.js";
import { EVALUATE_TRANSFORM_SYSTEM_PROMPT, GENERATE_TRANSFORM_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { logMessage } from "./logs.js";
import { isSelfHealingEnabled, transformAndValidateSchema } from "./tools.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface TransformConfig extends BaseConfig {
  instruction: string;
  responseSchema: JSONSchema;
  responseMapping?: JSONata;
}

export type TransformInputRequest = {
  id?: string;
  endpoint?: TransformConfig;
};

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

    const transformResult = await transformAndValidateSchema(
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
    if (currentConfig.responseMapping && !isSelfHealingEnabled(options, "transform")) {
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
      data: data,
      config: currentConfig
    };
  }
}

export async function generateTransformCode(
  schema: any,
  payload: any,
  instruction: string,
  metadata: Metadata,
  retry = 0,
  messages?: LLMMessage[]
): Promise<{ mappingCode: string; data?: any } | null> {
  try {
    logMessage('info', "Generating Transform Code" + (retry > 0 ? ` (retry ${retry})` : ''), metadata);

    if (!messages || messages?.length === 0) {
      const userPrompt = getTransformContext({ instruction, targetSchema: schema, sourceData: payload }, { characterBudget: 20000 });
      messages = [
        { role: "system", content: GENERATE_TRANSFORM_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ];
    }
    const temperature = Math.min(retry * 0.1, 1);

    const mappingSchema = z.object({
      mappingCode: z.string().describe("JS function as string")
    });

    const result = await LanguageModel.generateObject<z.infer<typeof mappingSchema>>({messages, schema: zodToJsonSchema(mappingSchema), temperature: temperature});
    messages = result.messages;
    
    if (!result.success) {
      throw new Error(`Error generating transform code: ${result.response}`);
    }

    let mappingCode = result.response.mappingCode;
    let transformedData: any;
    
    try {
      mappingCode = await prettier.format(mappingCode, { parser: "babel" });
      const transformResult = await transformAndValidateSchema(payload, mappingCode, schema);
      
      if (!transformResult.success) {
        throw new Error(`Transform failed: ${transformResult.error}`);
      }

      transformedData = transformResult.data;
    } catch (err) {
      throw new Error(`Generated code is invalid JS: ${err.message}`);
    }

    const evaluation = await evaluateTransform(transformedData, mappingCode, payload, schema, instruction, metadata);
    if (!evaluation.success) {
      throw new Error(`Mapping evaluation failed: ${evaluation.reason}`);
    }
    logMessage('info', `Mapping generated successfully`, metadata);
    return { mappingCode, data: transformedData };
  } catch (error) {
    if (retry < server_defaults.MAX_TRANSFORMATION_RETRIES) {
      const errorMessage = String(error.message);
      logMessage('warn', "Error generating JS mapping: " + errorMessage.slice(0, 1000), metadata);
      messages?.push({ role: "user", content: errorMessage });
      return generateTransformCode(schema, payload, instruction, metadata, retry + 1, messages);
    }
  }
  return null;
}

export async function evaluateTransform(
  transformedData: any,
  mappingCode: string,
  sourcePayload: any,
  targetSchema: any,
  instruction: string,
  metadata: Metadata
) {
  try {
    logMessage('info', "Evaluating final transform", metadata);

    const systemPrompt = EVALUATE_TRANSFORM_SYSTEM_PROMPT;
    const userPrompt = getEvaluateTransformContext({ instruction, targetSchema, sourceData: sourcePayload, transformedData, transformCode: mappingCode }, { characterBudget: 20000 });

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const llmResponseSchema = z.object({
      success: z.boolean().describe("True if the mapping is good, false otherwise."),
      reason: z.string().describe("Reasoning for the success status. If success is false, explain what is wrong with the mapping. If success is true, confirm correct transformation.")
    });
    
    const result = await LanguageModel.generateObject<z.infer<typeof llmResponseSchema>>({messages, schema: zodToJsonSchema(llmResponseSchema), temperature: 0});
    
    if (!result.success) {
      throw new Error(`Error evaluating transform: ${result.response}`);
    }
    return result.response;
  } catch (error) {
    const errorMessage = String(error instanceof Error ? error.message : error);
    logMessage('error', `Error evaluating transform: ${errorMessage.slice(0, 250)}`, metadata);
    return { success: false, reason: `Error during evaluation: ${errorMessage}` };
  }
}
import { BaseConfig, JSONata, JSONSchema, RequestOptions } from "@superglue/client";
import type { DataStore, Metadata } from "@superglue/shared";
import prettier from "prettier";
import { getEvaluateTransformContext, getTransformContext } from "../context/context-builders.js";
import { EVALUATE_TRANSFORM_SYSTEM_PROMPT, GENERATE_TRANSFORM_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { logMessage } from "./logs.js";
import { isSelfHealingEnabled, transformAndValidateSchema } from "./tools.js";

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

    // Schema for the expected LLM response
    const mappingSchema = {
      type: "object",
      properties: {
        mappingCode: { type: "string", description: "JS function as string" },
      },
      required: ["mappingCode"],
      additionalProperties: false
    };

    const { response, error: responseError, messages: updatedMessages } = await LanguageModel.generateObject(messages, mappingSchema, temperature);
    if (responseError || response?.error) {
      throw new Error(`Error generating transform code: ${responseError || response?.error}`);
    }
    messages = updatedMessages;
    try {
      // Autoformat the generated code
      response.mappingCode = await prettier.format(response.mappingCode, { parser: "babel" });
      const validation = await transformAndValidateSchema(payload, response.mappingCode, schema);
      if (!validation.success) {
        throw new Error(`Validation failed: ${validation.error}`);
      }
      response.data = validation.data;
    } catch (err) {
      throw new Error(`Generated code is invalid JS: ${err.message}`);
    }

    // Optionally, evaluate mapping quality as before
    const evaluation = await evaluateTransform(response.data, response.mappingCode, payload, schema, instruction, metadata);
    if (!evaluation.success) {
      throw new Error(`Mapping evaluation failed: ${evaluation.reason}`);
    }
    logMessage('info', `Mapping generated successfully`, metadata);
    return response;
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
): Promise<{ success: boolean; reason: string }> {
  try {
    logMessage('info', "Evaluating final transform", metadata);

    const systemPrompt = EVALUATE_TRANSFORM_SYSTEM_PROMPT;
    const userPrompt = getEvaluateTransformContext({ instruction, targetSchema, sourceData: sourcePayload, transformedData, transformCode: mappingCode }, { characterBudget: 20000 });

    const messages: LLMMessage[] = [
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
    const { response, error: responseError } = await LanguageModel.generateObject(messages, llmResponseSchema, 0);
    if (responseError || response?.error) {
      throw new Error(`Error evaluating transform: ${responseError || response?.error}`);
    }
    return response;

  } catch (error) {
    const errorMessage = String(error instanceof Error ? error.message : error);
    logMessage('error', `Error evaluating transform: ${errorMessage.slice(0, 250)}`, metadata);
    return { success: false, reason: `Error during evaluation: ${errorMessage}` };
  }
}
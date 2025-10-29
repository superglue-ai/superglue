import { BaseConfig, JSONata, JSONSchema, RequestOptions } from "@superglue/client";
import type { DataStore, Metadata } from "@superglue/shared";
import prettier from "prettier";
import { getEvaluateTransformContext, getTransformContext } from "../context/context-builders.js";
import { getFinalTransformErrorContext, getLoopSelectorErrorContext } from "../context/context-error-messages.js";
import { EVALUATE_TRANSFORM_SYSTEM_PROMPT, GENERATE_TRANSFORM_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { isSelfHealingEnabled, transformAndValidateSchema } from "./helpers.js";
import { logMessage } from "./logs.js";

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

    if (!result || !result?.transformationCode) {
      throw new Error("Failed to generate transformation mapping");
    }

    currentConfig = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...currentConfig,
      responseMapping: result.transformationCode
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
  context: "loop_selector" | "final_transform" = "final_transform",
  retry = 0,
  messages?: LLMMessage[],
  stepContext?: { stepId?: string; stepInstruction?: string }
): Promise<{ transformationCode: string; data?: any } | null> {
  let generatedCode: string | undefined;
  try {
    logMessage('info', `Generating ${context} code${retry > 0 ? ` (retry ${retry})` : ''}`, metadata);

    if (!messages || messages?.length === 0) {
      const userPrompt = getTransformContext({ instruction, targetSchema: schema, sourceData: payload }, { characterBudget: LanguageModel.contextLength / 10 });
      messages = [
        { role: "system", content: GENERATE_TRANSFORM_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ];
    }
    const temperature = Math.min(retry * 0.1, 1); // TODO: Evaluate whether this helps

    const outputSchema = {
      type: "object",
      properties: {
        transformationCode: { type: "string", description: `JS code as string` },
      },
      required: ["transformationCode"],
      additionalProperties: false
    };

    const { response, messages: updatedMessages } = await LanguageModel.generateObject(messages, outputSchema, temperature);
    messages = updatedMessages;
    let validationResult: any;
    try {
      if (!response.transformationCode) {
        logMessage('error', `LLM response missing transformationCode. Received: ${JSON.stringify(response)}`, metadata);
        throw new Error(`LLM did not return transformationCode field in response. Received keys: ${Object.keys(response).join(', ')}`);
      }
      generatedCode = await prettier.format(response.transformationCode, { parser: "babel" });
    } catch (err) {
      throw new Error(`execution_error: Code formatting failed - ${err.message}${err.stack ? '\nStack: ' + err.stack : ''}`);
    }

    try {
      validationResult = await transformAndValidateSchema(payload, generatedCode, schema);
      if (!validationResult.success) {
        throw new Error(`validation_error: ${validationResult.error}`);
      }
      response.data = validationResult.data;
    } catch (err) {
      if (err.message.startsWith('validation_error:')) {
        throw err;
      }
      throw new Error(`execution_error: Code execution failed - ${err.message}${err.stack ? '\nStack: ' + err.stack : ''}`);
    }

    const evaluation = await evaluateTransform(response.data, generatedCode, payload, schema, instruction, metadata);
    if (!evaluation.success) {
      throw new Error(`evaluation_error: ${evaluation.reason}`);
    }
    logMessage('info', `${context} code generated successfully`, metadata);
    return { transformationCode: generatedCode, data: response.data };
  } catch (error) {
    if (retry < server_defaults.MAX_TRANSFORMATION_RETRIES) {
      const errorMessage = String(error.message);
      logMessage('warn', `Error generating ${context} code: ${errorMessage.slice(0, 1000)}`, metadata);

      const enrichedError = context === "loop_selector"
        ? getLoopSelectorErrorContext(
          {
            step: { id: stepContext?.stepId || "unknown", apiConfig: { instruction: stepContext?.stepInstruction || instruction } } as any,
            payload,
            errorMessage,
            generatedCode
          },
          { characterBudget: 10000 }
        )
        : getFinalTransformErrorContext(
          {
            instruction,
            responseSchema: schema,
            sourceData: payload,
            errorMessage,
            generatedCode
          },
          { characterBudget: 10000 }
        );

      messages?.push({ role: "user", content: enrichedError });
      return generateTransformCode(schema, payload, instruction, metadata, context, retry + 1, messages, stepContext);
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
    const userPrompt = getEvaluateTransformContext({ instruction, targetSchema, sourceData: sourcePayload, transformedData, transformCode: mappingCode }, { characterBudget: LanguageModel.contextLength / 10 });

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
    const { response } = await LanguageModel.generateObject(messages, llmResponseSchema, 0);
    return response;

  } catch (error) {
    const errorMessage = String(error instanceof Error ? error.message : error);
    logMessage('error', `Error evaluating transform: ${errorMessage.slice(0, 250)}`, metadata);
    return { success: false, reason: `Error during evaluation: ${errorMessage}` };
  }
}
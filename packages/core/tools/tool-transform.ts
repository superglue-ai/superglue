import { JSONSchema, RequestOptions } from "@superglue/shared";
import type { Metadata } from "@superglue/shared";
import prettier from "prettier";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getEvaluateTransformContext, getTransformContext } from "../context/context-builders.js";
import { EVALUATE_TRANSFORM_SYSTEM_PROMPT, GENERATE_TRANSFORM_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { LanguageModel, LLMMessage } from "../llm/llm-base-model.js";
import { isSelfHealingEnabled, transformData, validateSchema } from "../utils/helpers.js";
import { logMessage } from "../utils/logs.js";

export interface ExecuteAndEvaluateFinalTransformInput {
  finalTransform: string;
  responseSchema: JSONSchema;
  aggregatedStepData: Record<string, unknown>;
  instruction: string;
  options: RequestOptions;
  metadata: Metadata;
}

export interface ExecuteAndEvaluateFinalTransformOutput {
  success: boolean;
  transformedData?: any;
  finalTransform: string;
  error?: string;
}

export async function executeAndEvaluateFinalTransform(input: ExecuteAndEvaluateFinalTransformInput): Promise<ExecuteAndEvaluateFinalTransformOutput> {
  const { finalTransform, responseSchema, aggregatedStepData, instruction, options, metadata } = input;
  
    try {
      const finalResult = await transformData(aggregatedStepData, finalTransform);

      if (responseSchema) {
        const validatedResult = await validateSchema(finalResult.data, responseSchema);
        if (!validatedResult.success) {
          throw new Error(validatedResult.error);
        }
      }
      if (!finalResult.success) {
        throw new Error(finalResult.error);
      }

      if (options?.testMode) {
        const testResult = await evaluateTransform(
          finalResult.data,
          finalResult.code,
          aggregatedStepData,
          responseSchema,
          instruction,
          metadata  
        );
        if (!testResult.success) {
          throw new Error(testResult.reason);
        }
      }

      return {
        success: true,
        transformedData: finalResult.data,
        finalTransform: finalResult.code
      };
    } catch (transformError) {
      
      if (!isSelfHealingEnabled(options, "transform")) {
        return {
          success: false,
          error: transformError?.message || transformError,
          finalTransform: finalTransform
        };
      }

      logMessage("info", `Transform needs to be fixed: ${transformError?.message || transformError}. Generating new final transform`,metadata);
      const prompt = "Generate the final transformation code." +
        (instruction ? " with the following instruction: " + instruction : "") +
        (finalTransform ? "\nOriginally, we used the following transformation, fix it without messing up future transformations with the original data: " + finalTransform : "");

      const transformationResult = await generateWorkingTransform({
        targetSchema: responseSchema,
        inputData: aggregatedStepData,
        instruction: prompt,
        metadata: metadata
      });
      
      if (!transformationResult) {
        return {
          success: false,
          error: "Failed to generate new final transform",
          finalTransform: finalTransform
      }
    }

    return {
      success: true,
      transformedData: transformationResult.data,
      finalTransform: transformationResult.transformCode
    };
  }
}

export async function generateWorkingTransform({
  targetSchema,
  inputData,
  instruction,
  metadata,
  retry = 0,
  messages = []
}: {
  targetSchema: any,
  inputData: any,
  instruction: string,
  metadata: Metadata,
  retry?: number,
  messages?: LLMMessage[]
}): Promise<{ transformCode: string; data?: any } | null> {
  try {
    logMessage('info', "Generating Transform Code" + (retry > 0 ? ` (retry ${retry})` : ''), metadata);

    if (!messages || messages?.length === 0) {
      const userPrompt = getTransformContext({ instruction, targetSchema: targetSchema, sourceData: inputData }, { characterBudget: 20000 });
      messages = [
        { role: "system", content: GENERATE_TRANSFORM_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ];
    }
    const temperature = Math.min(retry * 0.1, 1);

    const transformSchema = z.object({
      transformCode: z.string().describe("JS function as string")
    });

    const result = await LanguageModel.generateObject<z.infer<typeof transformSchema>>({messages, schema: zodToJsonSchema(transformSchema), temperature: temperature});
    messages = result.messages;
    
    if (!result.success) {
      throw new Error(`Error generating transform code: ${result.response}`);
    }

    let transformCode = result.response.transformCode;
    let transformedData: any;
    
    try {
      transformCode = await prettier.format(transformCode, { parser: "babel" });
      const transformResult = await transformData(inputData, transformCode);

      if (targetSchema) {
        const validatedResult = await validateSchema(transformResult.data, targetSchema);
        if (!validatedResult.success) {
          throw new Error(`Schema validation failed: ${validatedResult.error}`);
        }
      }
      if (!transformResult.success) {
        throw new Error(`Transform failed: ${transformResult.error}`);
      }

      transformedData = transformResult.data;
    } catch (err) {
      throw new Error(`Generated code is invalid JS: ${err.message}`);
    }

    const evaluation = await evaluateTransform(transformedData, transformCode, inputData, targetSchema, instruction, metadata);
    if (!evaluation.success) {
      throw new Error(`Transform evaluation failed: ${evaluation.reason}`);
    }
    logMessage('info', `Transform generated successfully`, metadata);
    return { transformCode: transformCode, data: transformedData };
  } catch (error) {
    if (retry < server_defaults.MAX_TRANSFORMATION_RETRIES) {
      const errorMessage = String(error.message);
      logMessage('warn', "Error generating JS transform: " + errorMessage.slice(0, 1000), metadata);
      
      messages?.push({ role: "user", content: errorMessage });
      
      return generateWorkingTransform({
        targetSchema: targetSchema,
        inputData: inputData,
        instruction: instruction,
        metadata: metadata,
        retry: retry + 1,
        messages: messages
      });
    }
  }
  return null;
}

export async function evaluateTransform(
  transformedData: any,
  transformCode: string,
  sourcePayload: any,
  targetSchema: any,
  instruction: string,
  metadata: Metadata
) {
  try {
    logMessage('info', "Evaluating final transform", metadata);
    const userPrompt = getEvaluateTransformContext({ instruction, targetSchema, sourceData: sourcePayload, transformedData, transformCode: transformCode }, { characterBudget: 20000 });

    const messages: LLMMessage[] = [
      { role: "system", content: EVALUATE_TRANSFORM_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    const llmResponseSchema = z.object({
      success: z.boolean().describe("True if the transform is good, false otherwise."),
      reason: z.string().describe("Reasoning for the success status. If success is false, explain what is wrong with the transform. If success is true, confirm correct transformation.")
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
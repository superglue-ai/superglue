import type { ServiceMetadata } from "@superglue/shared";
import { JSONSchema, RequestOptions } from "@superglue/shared";
import { transformData, validateSchema } from "../utils/helpers.js";

export interface ExecuteAndEvaluateFinalTransformInput {
  finalTransform: string;
  responseSchema: JSONSchema;
  aggregatedStepData: Record<string, unknown>;
  instruction: string;
  options: RequestOptions;
  metadata: ServiceMetadata;
}

export interface ExecuteAndEvaluateFinalTransformOutput {
  success: boolean;
  transformedData?: any;
  finalTransform: string;
  error?: string;
}

export async function executeAndEvaluateFinalTransform(
  input: ExecuteAndEvaluateFinalTransformInput,
): Promise<ExecuteAndEvaluateFinalTransformOutput> {
  const { finalTransform, responseSchema, aggregatedStepData, instruction, options, metadata } =
    input;

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

    return {
      success: true,
      transformedData: finalResult.data,
      finalTransform: finalResult.code,
    };
  } catch (transformError) {
    return {
      success: false,
      error: transformError instanceof Error ? transformError.message : String(transformError),
      finalTransform: finalTransform,
    };
  }
}

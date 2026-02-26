import type { ServiceMetadata } from "@superglue/shared";
import { JSONSchema, RequestOptions } from "@superglue/shared";
import { transformData, validateSchema } from "../utils/helpers.js";

export interface ExecuteOutputTransformInput {
  outputTransform: string;
  outputSchema: JSONSchema;
  aggregatedStepData: Record<string, unknown>;
  instruction: string;
  options: RequestOptions;
  metadata: ServiceMetadata;
}

export interface ExecuteOutputTransformOutput {
  success: boolean;
  transformedData?: any;
  outputTransform: string;
  error?: string;
}

export async function executeOutputTransform(
  input: ExecuteOutputTransformInput,
): Promise<ExecuteOutputTransformOutput> {
  const { outputTransform, outputSchema, aggregatedStepData, instruction, options, metadata } =
    input;

  try {
    const result = await transformData(aggregatedStepData, outputTransform);

    if (outputSchema) {
      const validatedResult = await validateSchema(result.data, outputSchema);
      if (!validatedResult.success) {
        throw new Error(validatedResult.error);
      }
    }
    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      transformedData: result.data,
      outputTransform: result.code,
    };
  } catch (transformError) {
    return {
      success: false,
      error: transformError instanceof Error ? transformError.message : String(transformError),
      outputTransform: outputTransform,
    };
  }
}

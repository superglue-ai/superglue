/**
 * Transform Strategy for Deno runtime
 *
 * Executes JavaScript transform steps natively in Deno.
 */

import type { TransformStepConfig, ServiceMetadata, StepExecutionResult } from "../types.ts";
import { executeTransform } from "../utils/transform.ts";
import { debug } from "../utils/logging.ts";

/**
 * Execute a transform step
 */
export async function executeTransformStep(
  config: TransformStepConfig,
  payload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  metadata: ServiceMetadata,
): Promise<StepExecutionResult> {
  debug(`Executing transform step with code: ${config.transformCode.slice(0, 100)}...`, metadata);

  // Merge credentials directly into the data available to the transform code
  // This allows transforms to access system credentials like sourceData.openai_apiKey
  const dataWithCredentials = {
    ...payload,
    ...credentials,
  };

  const result = await executeTransform(dataWithCredentials, config.transformCode, metadata);

  if (!result.success) {
    return {
      success: false,
      data: {},
      error: `Transform step failed: ${result.error}`,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

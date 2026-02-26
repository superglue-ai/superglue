import { TransformStepConfig, isTransformConfig } from "@superglue/shared";
import { transformData } from "../../../utils/helpers.js";
import { logMessage } from "../../../utils/logs.js";
import {
  ResolvedStepContext,
  StepExecutionInput,
  StepExecutionStrategy,
  StepStrategyExecutionResult,
} from "../strategy.js";

export class TransformStepExecutionStrategy implements StepExecutionStrategy {
  readonly version = "1.0.0";

  shouldExecute(input: StepExecutionInput, _resolved: ResolvedStepContext): boolean {
    return isTransformConfig(input.stepConfig);
  }

  async executeStep(input: StepExecutionInput): Promise<StepStrategyExecutionResult> {
    const { stepConfig, stepInputData, metadata } = input;
    const config = stepConfig as TransformStepConfig;

    logMessage(
      "debug",
      `Executing transform step with code: ${config.transformCode.slice(0, 100)}...`,
      metadata,
    );

    const result = await transformData(stepInputData, config.transformCode);

    if (!result.success) {
      return {
        success: false,
        strategyExecutionData: {},
        error: `Transform step failed: ${result.error}`,
      };
    }

    return {
      success: true,
      strategyExecutionData: result.data,
    };
  }
}

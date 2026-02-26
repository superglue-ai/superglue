import {
  RequestOptions,
  ServiceMetadata,
  StepConfig,
  RequestStepConfig,
  FailureBehavior,
  System,
  isRequestConfig,
} from "@superglue/shared";
import { replaceVariables } from "../../utils/helpers.js";

export interface StepStrategyExecutionResult {
  success: boolean;
  strategyExecutionData: any;
  error?: string;
}

export interface StepExecutionInput {
  stepConfig: StepConfig;
  stepInputData: any;
  credentials: Record<string, any>;
  requestOptions?: RequestOptions;
  failureBehavior?: FailureBehavior;
  metadata: ServiceMetadata;
  system?: System;
}

export interface ResolvedStepContext {
  resolvedUrl: string;
}

export async function resolveStepContext(input: StepExecutionInput): Promise<ResolvedStepContext> {
  if (!isRequestConfig(input.stepConfig)) {
    return { resolvedUrl: "" };
  }
  const config = input.stepConfig as RequestStepConfig;
  const allVars = { ...input.stepInputData, ...input.credentials };

  // First resolve variables in the URL
  let resolvedUrl = await replaceVariables(config.url || "", allVars);

  return { resolvedUrl };
}

export interface StepExecutionStrategy {
  readonly version: string;

  shouldExecute(input: StepExecutionInput, resolved: ResolvedStepContext): boolean;

  executeStep(
    input: StepExecutionInput,
  ): Promise<StepStrategyExecutionResult> | StepStrategyExecutionResult;
}

export class StepExecutionStrategyRegistry {
  private strategies: StepExecutionStrategy[] = [];

  register(strategy: StepExecutionStrategy): void {
    this.strategies.push(strategy);
  }

  getStrategies(): StepExecutionStrategy[] {
    return [...this.strategies];
  }

  async routeAndExecute(input: StepExecutionInput): Promise<StepStrategyExecutionResult> {
    const resolved = await resolveStepContext(input);

    for (const strategy of this.strategies) {
      if (strategy.shouldExecute(input, resolved)) {
        try {
          // Pass the resolved URL to the strategy
          const modifiedInput = {
            ...input,
            stepConfig: {
              ...input.stepConfig,
              url: resolved.resolvedUrl,
            },
          };
          return await strategy.executeStep(modifiedInput);
        } catch (error) {
          return {
            success: false,
            strategyExecutionData: {},
            error: error.message,
          };
        }
      }
    }
    return {
      success: false,
      strategyExecutionData: {},
      error:
        "Unsupported URL protocol. URL must start with a supported protocol (http://, https://, postgres://, postgresql://, ftp://, ftps://, sftp://, smb://).",
    };
  }
}

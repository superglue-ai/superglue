import {
  RequestOptions,
  ServiceMetadata,
  StepConfig,
  RequestStepConfig,
  FailureBehavior,
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
}

export interface StepExecutionStrategy {
  readonly version: string;

  shouldExecute(resolvedUrlHost: string): boolean;

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
    // URL-based routing for request steps (HTTP, SFTP, Postgres, etc.)
    const requestConfig = input.stepConfig as RequestStepConfig;
    const allVars = { ...input.stepInputData, ...input.credentials };
    const resolvedUrl = await replaceVariables(requestConfig.url || "", allVars);

    for (const strategy of this.strategies) {
      if (strategy.shouldExecute(resolvedUrlHost)) {
        try {
          return await strategy.executeStep(input);
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
        "Unsupported URL protocol. URL must start with a supported protocol (http://, https://, postgres://, postgresql://, ftp://, ftps://, sftp://).",
    };
  }
}

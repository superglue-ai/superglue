import {
  getToolSystemIds,
  isRequestConfig,
  maskCredentials,
  RequestOptions,
  RequestStepConfig,
  ResponseFilter,
  ServiceMetadata,
  StepConfig,
  Tool,
  ToolResult,
  ToolStep,
  ToolStepResult,
  System,
} from "@superglue/shared";
import { flattenAndNamespaceCredentials } from "@superglue/shared/utils";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { server_defaults } from "../default.js";
import { SystemManager } from "../systems/system-manager.js";
import { LanguageModel, LLMMessage } from "../llm/llm-base-model.js";
import { transformData } from "../utils/helpers.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { applyResponseFilters, FilterMatchError } from "./response-filters.js";
import { FTPStepExecutionStrategy } from "./strategies/ftp/ftp.js";
import { AbortError, ApiCallError, HttpStepExecutionStrategy } from "./strategies/http/http.js";
import { PostgresStepExecutionStrategy } from "./strategies/postgres/postgres.js";
import { StepExecutionStrategyRegistry } from "./strategies/strategy.js";
import { executeOutputTransform } from "./tool-transform.js";

export interface ToolExecutorOptions {
  tool: Tool;
  metadata: ServiceMetadata;
  systems: SystemManager[];
}

export class ToolExecutor implements Tool {
  public id: string;
  public steps: ToolStep[];
  public outputTransform?: string;
  public result: ToolResult;
  public outputSchema?: JSONSchema;
  public metadata: ServiceMetadata;
  public instruction?: string;
  public inputSchema?: JSONSchema;
  public responseFilters?: ResponseFilter[];
  private systems: Record<string, SystemManager>;
  private strategyRegistry: StepExecutionStrategyRegistry;

  constructor({ tool, metadata, systems }: ToolExecutorOptions) {
    this.id = tool.id;
    this.steps = tool.steps;
    this.outputTransform = tool.outputTransform;
    this.outputSchema = tool.outputSchema;
    this.instruction = tool.instruction;
    this.metadata = metadata;
    this.inputSchema = tool.inputSchema;
    this.responseFilters = tool.responseFilters;

    this.systems = systems.reduce(
      (acc, sys) => {
        acc[sys.id] = sys;
        return acc;
      },
      {} as Record<string, SystemManager>,
    );

    this.result = {
      success: false,
      data: {},
      stepResults: [],
      tool: tool,
    } as ToolResult;

    this.strategyRegistry = new StepExecutionStrategyRegistry();
    this.strategyRegistry.register(new HttpStepExecutionStrategy());
    this.strategyRegistry.register(new PostgresStepExecutionStrategy());
    this.strategyRegistry.register(new FTPStepExecutionStrategy());
  }

  public async execute({
    payload = {},
    credentials = {},
    options = {},
  }: {
    payload?: Record<string, any>;
    credentials?: Record<string, string>;
    options?: RequestOptions;
  }): Promise<ToolResult & { data?: any }> {
    try {
      this.validate({ payload, credentials });

      for (const step of this.steps) {
        const aggregatedStepData = this.buildAggregatedStepData(payload);
        const stepResult = await this.executeStep({
          step,
          stepInput: aggregatedStepData,
          credentials,
          options,
        });
        this.result.stepResults.push(stepResult.result);

        step.config = stepResult.updatedStep.config;
        step.dataSelector = stepResult.updatedStep.dataSelector;

        if (!stepResult.result.success && step.failureBehavior !== "continue") {
          return this.completeWithFailure(stepResult.result.error || "Step execution failed");
        }
      }

      if (this.outputTransform || this.outputSchema || this.responseFilters?.length) {
        const finalAggregatedStepData = this.buildAggregatedStepData(payload);

        const transformResult = await executeOutputTransform({
          aggregatedStepData: finalAggregatedStepData,
          outputTransform: this.outputTransform,
          outputSchema: this.outputSchema,
          instruction: this.instruction,
          options: options,
          metadata: this.metadata,
        });

        if (!transformResult.success) {
          return this.completeWithFailure(transformResult.error);
        }

        let finalData = transformResult.transformedData || {};

        // Apply response filters after transform
        if (this.responseFilters?.length) {
          const filterResult = applyResponseFilters(finalData, this.responseFilters);
          if (filterResult.failedFilters.length > 0) {
            throw new FilterMatchError(filterResult.failedFilters);
          }
          finalData = filterResult.data;
          if (filterResult.matches.length > 0) {
            logMessage(
              "info",
              `Response filters applied: ${filterResult.matches.length} match(es)`,
              this.metadata,
            );
          }
        }

        this.result.data = finalData;
        this.result.tool = {
          id: this.id,
          steps: this.steps,
          outputTransform: transformResult.outputTransform,
          inputSchema: this.inputSchema,
          outputSchema: this.outputSchema,
          instruction: this.instruction,
          responseFilters: this.responseFilters,
        } as Tool;
      } else {
        // Always set tool to propagate wrapped dataSelectors back to frontend
        this.result.tool = {
          id: this.id,
          steps: this.steps,
          outputTransform: this.outputTransform,
          inputSchema: this.inputSchema,
          outputSchema: this.outputSchema,
          instruction: this.instruction,
          responseFilters: this.responseFilters,
        } as Tool;
      }
      return this.completeWithSuccess();
    } catch (error) {
      return this.completeWithFailure(error?.message || error);
    }
  }

  private async executeStep({
    step,
    stepInput,
    credentials,
    options,
  }: {
    step: ToolStep;
    stepInput: Record<string, any>;
    credentials: Record<string, string>;
    options: RequestOptions;
  }): Promise<{ result: ToolStepResult; updatedStep: ToolStep }> {
    try {
      let retryCount = 0;
      let lastError: string | null = null;
      let messages: LLMMessage[] = [];
      let currentConfig = step.config;
      let currentDataSelector = step.dataSelector;
      let stepCredentials = credentials;
      let isLoopStep = false;
      let stepResults: any[] = [];

      // Get systemId from config for request steps
      const systemId = isRequestConfig(currentConfig) ? currentConfig.systemId : undefined;
      const systemManager = systemId ? this.systems[systemId] : undefined;
      let currentSystem: System | null = null;
      let loopPayload: any = null;

      if (systemId && !systemManager) {
        throw new Error(
          `System '${systemId}' not found. Available systems: ${Object.keys(this.systems).join(", ")}`,
        );
      }

      // Get system early so it's available even if data selector fails
      await systemManager?.refreshTokenIfNeeded();
      currentSystem = await systemManager?.getSystem();

      if (currentSystem) {
        stepCredentials = {
          ...credentials,
          ...flattenAndNamespaceCredentials([currentSystem]),
        } as Record<string, string>;
      }
      try {
        const dataSelectorTransformResult = await transformData(stepInput, currentDataSelector);
        if (!dataSelectorTransformResult.success) {
          throw new Error(
            `Loop selector for '${step.id}' failed. ${dataSelectorTransformResult.error}\nCode: ${currentDataSelector}\nPayload: ${JSON.stringify(stepInput).slice(0, 1000)}...`,
          );
        }
        const dataSelectorOutput = dataSelectorTransformResult.data || {};

        isLoopStep = Array.isArray(dataSelectorOutput);
        let itemsToExecuteStepOn = isLoopStep ? dataSelectorOutput : [dataSelectorOutput || {}];

        itemsToExecuteStepOn = itemsToExecuteStepOn.slice(
          0,
          server_defaults.DEFAULT_LOOP_MAX_ITERS,
        );

        stepResults = [];
        for (let i = 0; i < itemsToExecuteStepOn.length; i++) {
          const currentItem = itemsToExecuteStepOn[i];

          if (itemsToExecuteStepOn.length > 1) {
            logMessage(
              "debug",
              `Executing loop iteration ${i + 1}/${itemsToExecuteStepOn.length} with item: ${JSON.stringify(currentItem).slice(0, 100)}...`,
              this.metadata,
            );
          }

          loopPayload = { currentItem, ...stepInput };

          // Refresh system token if needed (important for long-running loops)
          await systemManager?.refreshTokenIfNeeded();
          currentSystem = await systemManager?.getSystem();

          // Repeated to update the credentials with the latest OAuth token
          if (currentSystem) {
            stepCredentials = {
              ...credentials,
              ...flattenAndNamespaceCredentials([currentSystem]),
            } as Record<string, string>;
          }

          try {
            const itemExecutionResult = await this.strategyRegistry.routeAndExecute({
              stepConfig: currentConfig,
              stepInputData: loopPayload,
              credentials: stepCredentials,
              requestOptions: options,
              metadata: this.metadata,
              failureBehavior: step.failureBehavior,
            });

            if (
              !itemExecutionResult.success ||
              itemExecutionResult.strategyExecutionData === undefined
            ) {
              throw new Error(
                itemExecutionResult.error ||
                  `No data returned from iteration: ${i + 1} in step: ${step.id}`,
              );
            }

            const stepResponseData = {
              currentItem,
              data: itemExecutionResult.strategyExecutionData,
              success: true,
            };

            stepResults.push(stepResponseData);
          } catch (error) {
            if (step.failureBehavior === "continue") {
              const errorMessage = maskCredentials(
                error?.message || String(error),
                stepCredentials,
              );
              logMessage(
                "warn",
                `Iteration ${i + 1} failed but continuing due to failureBehavior=CONTINUE: ${errorMessage}`,
                this.metadata,
              );

              const stepResponseData = {
                currentItem,
                data: null,
                success: false,
                error: errorMessage,
              };

              stepResults.push(stepResponseData);
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        lastError = maskCredentials(error?.message || String(error), stepCredentials).slice(
          0,
          10000,
        );
        messages.push({ role: "user", content: `Error: ${lastError}` });
        logMessage("info", `Step execution failed: ${lastError}`, this.metadata);

        telemetryClient?.captureException(
          new Error(`API call failed after ${retryCount} attempts: ${lastError}`),
          this.metadata?.orgId,
          { currentConfig, retryCount },
        );
        throw new ApiCallError(`Error executing step ${step.id}: ${lastError}`, 500);
      }

      logMessage("info", `Step '${step.id}' Complete`, this.metadata);

      const stepSuccess =
        step.failureBehavior === "continue" || stepResults.length === 0
          ? true
          : stepResults.some((r) => r.success);

      const toolStepResult: ToolStepResult = {
        stepId: step.id,
        success: stepSuccess,
        data: isLoopStep ? stepResults : stepResults[0] || null,
        error: this.getStepErrorMessage(stepSuccess, stepResults, isLoopStep),
      };

      const updatedStep: ToolStep = {
        ...step,
        config: currentConfig,
        dataSelector: currentDataSelector,
      };

      return {
        result: toolStepResult,
        updatedStep: updatedStep,
      };
    } catch (error) {
      logMessage("info", `Step '${step.id}' Failed`, this.metadata);

      return {
        result: {
          stepId: step.id,
          success: false,
          data: null,
          error: error.message || error,
        },
        updatedStep: step,
      } as { result: ToolStepResult; updatedStep: ToolStep };
    }
  }

  private validate(payload: Record<string, unknown>): void {
    if (!this.id) {
      throw new Error("Tool must have a valid ID");
    }

    if (!this.steps || !Array.isArray(this.steps)) {
      throw new Error("Execution steps must be an array");
    }

    if (!this.strategyRegistry) {
      throw new Error("Step execution strategy registry is required");
    }

    for (const step of this.steps) {
      if (!step.id) {
        throw new Error("Each step must have an ID");
      }

      if (!step.config) {
        throw new Error("Each step must have a config");
      }

      if (isRequestConfig(step.config) && !(step.config as RequestStepConfig).url) {
        throw new Error("Request steps must have a URL");
      }
    }
  }

  private buildAggregatedStepData(
    originalPayload: Record<string, ToolStepResult>,
  ): Record<string, ToolStepResult> {
    const stepResults: Record<string, ToolStepResult> = {};

    for (const result of this.result.stepResults) {
      if (result?.data) {
        stepResults[result.stepId] = result.data;
      }
    }

    return {
      ...originalPayload,
      ...stepResults,
    };
  }

  private getStepErrorMessage(
    stepSuccess: boolean,
    stepResults: any[],
    isLoopStep: boolean,
  ): string | undefined {
    if (stepSuccess) {
      return undefined;
    }

    const failedCount = stepResults.filter((r) => !r.success).length;
    const totalCount = stepResults.length;
    const failedIndices = stepResults
      .map((r, idx) => (!r.success ? idx + 1 : null))
      .filter((idx) => idx !== null);

    if (isLoopStep) {
      return `${failedCount}/${totalCount} iteration(s) failed (iterations: ${failedIndices.join(", ")})`;
    }

    return stepResults[0]?.error || "Step execution failed";
  }

  private completeWithSuccess(): ToolResult {
    this.result.success = true;
    this.result.error = undefined;
    return this.result;
  }

  private completeWithFailure(error: any): ToolResult {
    this.result.success = false;
    this.result.error = error;
    return this.result;
  }
}

import { ApiConfig, ExecutionStep, Integration, RequestOptions, Tool, ToolResult, ToolStepResult } from "@superglue/shared";
import { maskCredentials, Metadata } from "@superglue/shared";
import { flattenAndNamespaceCredentials } from "@superglue/shared/utils";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getEvaluateStepResponseContext, getGenerateStepConfigContext } from "../context/context-builders.js";
import { EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT, GENERATE_STEP_CONFIG_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel, LLMMessage } from "../llm/llm-base-model.js";
import { isSelfHealingEnabled, transformData } from "../utils/helpers.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { executeAndEvaluateFinalTransform, generateWorkingTransform } from "./tool-transform.js";
import { AbortError, ApiCallError, HttpStepExecutionStrategy } from "./strategies/http/http.js";
import { generateStepConfig } from "./tool-step-builder.js";
import { StepExecutionStrategyRegistry } from "./strategies/strategy.js";
import { PostgresStepExecutionStrategy } from "./strategies/postgres/postgres.js";
import { FTPStepExecutionStrategy } from "./strategies/ftp/ftp.js";

export interface ToolExecutorOptions {
  tool: Tool;
  metadata: Metadata;
  integrations: IntegrationManager[];
}

export class ToolExecutor implements Tool {
  public id: string;
  public steps: ExecutionStep[];
  public finalTransform?: string;
  public result: ToolResult;
  public responseSchema?: JSONSchema;
  public metadata: Metadata;
  public instruction?: string;
  public inputSchema?: JSONSchema;
  public integrationIds: string[];
  private integrations: Record<string, IntegrationManager>;
  private strategyRegistry: StepExecutionStrategyRegistry;
  
  constructor({ tool, metadata, integrations }: ToolExecutorOptions) {
    this.id = tool.id;
    this.steps = tool.steps;
    this.finalTransform = tool.finalTransform;
    this.responseSchema = tool.responseSchema;
    this.instruction = tool.instruction;
    this.metadata = metadata;
    this.inputSchema = tool.inputSchema;

    this.integrations = integrations.reduce((acc, int) => {
      acc[int.id] = int;
      return acc;
    }, {} as Record<string, IntegrationManager>);

    this.integrationIds = tool.integrationIds;

    this.result = {
      id: crypto.randomUUID(),
      success: false,
      data: {},
      stepResults: [],
      startedAt: new Date(),
      completedAt: undefined,
      config: tool,
    } as ToolResult;

    this.strategyRegistry = new StepExecutionStrategyRegistry();
    this.strategyRegistry.register(new HttpStepExecutionStrategy());
    this.strategyRegistry.register(new PostgresStepExecutionStrategy());
    this.strategyRegistry.register(new FTPStepExecutionStrategy());
  }

  
  public async execute({ payload = {}, credentials = {}, options = {} }: { payload?: Record<string, any>, credentials?: Record<string, string>, options?: RequestOptions }): Promise<ToolResult & { data?: any }> {
    try {
      this.validate({ payload, credentials });
      logMessage("debug", `Executing tool ${this.id}`, this.metadata);

      for (const step of this.steps) {
        const aggregatedStepData = this.buildAggregatedStepData(payload);
        const stepResult = await this.executeStep({ step, stepInput: aggregatedStepData, credentials, options });
        this.result.stepResults.push(stepResult.result);
        
        step.apiConfig = stepResult.updatedStep.apiConfig;
        step.loopSelector = stepResult.updatedStep.loopSelector;

        if (!stepResult.result.success) {
          return this.completeWithFailure(stepResult.result.error || 'Step execution failed');
        }
      }

      if (this.finalTransform || this.responseSchema) {
        const finalAggregatedStepData = this.buildAggregatedStepData(payload);
        
        const finalTransformResult = await executeAndEvaluateFinalTransform({
          aggregatedStepData: finalAggregatedStepData,
          finalTransform: this.finalTransform,
          responseSchema: this.responseSchema,
          instruction: this.instruction,
          options: options,
          metadata: this.metadata
        });

        if (!finalTransformResult.success) {
          return this.completeWithFailure(finalTransformResult.error);
        }

        this.result.data = finalTransformResult.transformedData || {};
        this.result.config = {
          id: this.id,
          integrationIds: this.integrationIds,
          steps: this.steps,
          finalTransform: finalTransformResult.finalTransform,
          inputSchema: this.inputSchema,
          responseSchema: this.responseSchema,
          instruction: this.instruction
        } as Tool;
      } else {
        // Always set config to propagate wrapped loopSelectors back to frontend
        this.result.config = {
          id: this.id,
          steps: this.steps,
          finalTransform: this.finalTransform,
          inputSchema: this.inputSchema,
          responseSchema: this.responseSchema,
          instruction: this.instruction
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
    options
  }: {
    step: ExecutionStep,
    stepInput: Record<string, any>,
    credentials: Record<string, string>,
    options: RequestOptions
  }): Promise<{result: ToolStepResult, updatedStep: ExecutionStep}> {
    try {
      const isSelfHealing = isSelfHealingEnabled(options, "api");
      let retryCount = 0;
      let lastError: string | null = null;
      let messages: LLMMessage[] = [];
      let currentConfig = step.apiConfig;
      let currentDataSelector = step.loopSelector;
      let stepCredentials = credentials;
      let isLoopStep = false;
      let stepResults: any[] = [];
      
      const integrationManager = this.integrations[step.integrationId];
      let currentIntegration: Integration | null = null;
      let loopPayload: any = null;
      
      if (!integrationManager) {
        throw new Error(`Integration '${step.integrationId}' not found. Available integrations: ${Object.keys(this.integrations).join(', ')}`);
      }

      // Get integration early so it's available for self-healing even if data selector fails
      await integrationManager?.refreshTokenIfNeeded();
      currentIntegration = await integrationManager?.getIntegration();
      
      if (currentIntegration) {
        stepCredentials = {
          ...credentials,
          ...flattenAndNamespaceCredentials([currentIntegration])
        } as Record<string, string>;
      }

      const maxRetries = isSelfHealing 
        ? (options?.retries !== undefined ? options.retries : server_defaults.MAX_CALL_RETRIES) 
        : 1;
      while (retryCount < maxRetries) {
        try {
          const dataSelectorTransformResult = await transformData(stepInput, currentDataSelector);
          if (!dataSelectorTransformResult.success) {
            throw new Error(`Loop selector for '${step.id}' failed. ${dataSelectorTransformResult.error}\nCode: ${currentDataSelector}\nPayload: ${JSON.stringify(stepInput).slice(0, 1000)}...`);
          }
          const dataSelectorOutput = dataSelectorTransformResult.data || {};

          isLoopStep = Array.isArray(dataSelectorOutput);
          let itemsToExecuteStepOn = isLoopStep 
            ? dataSelectorOutput 
            : [dataSelectorOutput || {}];
          
          itemsToExecuteStepOn = itemsToExecuteStepOn.slice(0, step.loopMaxIters || server_defaults.DEFAULT_LOOP_MAX_ITERS);

          stepResults = [];
          for (let i = 0; i < itemsToExecuteStepOn.length; i++) {
            const currentItem = itemsToExecuteStepOn[i];
            
            if (itemsToExecuteStepOn.length > 1) {
              logMessage("debug", `Executing loop iteration ${i + 1}/${itemsToExecuteStepOn.length} with item: ${JSON.stringify(currentItem).slice(0, 100)}...`, this.metadata);
            }
    
            loopPayload = { currentItem, ...stepInput };

            // Refresh integration token if needed (important for long-running loops)
            await integrationManager?.refreshTokenIfNeeded();
            currentIntegration = await integrationManager?.getIntegration();
            
            if (currentIntegration) {
              stepCredentials = {
                ...credentials,
                ...flattenAndNamespaceCredentials([currentIntegration])
              } as Record<string, string>;
            }
            

            const itemExecutionResult = await this.strategyRegistry.routeAndExecute({
              stepConfig: currentConfig,
              stepInputData: loopPayload,
              credentials: stepCredentials,
              requestOptions: { ...options, testMode: false }
            });

            if (!itemExecutionResult.success || itemExecutionResult.strategyExecutionData === undefined) {
              throw new Error(itemExecutionResult.error || `No data returned from iteration: ${i + 1} in step: ${step.id}`);
            }

            const stepResponseData = { 
              currentItem, 
              data: itemExecutionResult.strategyExecutionData 
            };
            
            stepResults.push({
              stepId: step.id,
              success: true,
              stepResponseData,
            });
          }
          // llm as a judge validation on the output data, this function throws an error if the data does not align with the instruction
          if (options.testMode || isSelfHealing) {
            await this.validateStepResponse(
              isLoopStep 
                ? stepResults.map(r => r.stepResponseData)
                : stepResults[0]?.stepResponseData || null,
              currentConfig,
              integrationManager
            );
          }

          // we went through the whole step without errors, so we can break out of the retry loop
          break;
        } catch (error) {
          lastError = maskCredentials(error?.message || String(error), stepCredentials).slice(0, 10000);
            
          if (retryCount > 0) {
            messages.push({ role: "user", content: `Error: ${lastError}` });
            logMessage('info', `Step execution failed: ${lastError}`, this.metadata);
          }

          if (error instanceof AbortError) throw error;

          retryCount++;
          
          if (retryCount >= maxRetries) {
            this.handleMaxRetriesExceeded(step.id,currentConfig, retryCount, lastError);
          }

          if (isSelfHealing) {
            logMessage('info', `Self healing step config (retry ${retryCount})`, this.metadata);

            if (messages.length === 0) {
              messages = await this.initializeSelfHealingContext(
                integrationManager,
                currentConfig,
                currentDataSelector,
                loopPayload,
                stepCredentials,
                currentIntegration
              );
            }

            const generateStepConfigResult = await generateStepConfig({
              retryCount,
              messages,
              integration: currentIntegration
            });
            
            if (!generateStepConfigResult.success) {
              throw new Error(generateStepConfigResult.error);
            }

            currentConfig = { ...currentConfig, ...generateStepConfigResult.config } as ApiConfig;
            currentDataSelector = generateStepConfigResult.dataSelector;
          }
        }
      }

      logMessage("info", `'${step.id}' Complete`, this.metadata);
      
      const toolStepResult = {
        stepId: step.id,
        success: true,
        data: isLoopStep 
          ? stepResults.map(r => r.stepResponseData)
          : stepResults[0]?.stepResponseData || null,
        error: undefined
      } as ToolStepResult;

      const updatedStep = {
        ...step,
        apiConfig: currentConfig,
        loopSelector: currentDataSelector
      } as ExecutionStep;

      return {
        result: toolStepResult,
        updatedStep: updatedStep
      };

      
    } catch (error) {
      logMessage("info", `'${step.id}' Failed`, this.metadata);
      
      return {
        result: {
          stepId: step.id,
          success: false,
          data: null,
          error: error.message || error
        },
        updatedStep: step
      } as {result: ToolStepResult, updatedStep: ExecutionStep};
    }
  }

  private async initializeSelfHealingContext(
    integrationManager: IntegrationManager,
    config: ApiConfig,
    loopSelector: string,
    payload: any,
    credentials: Record<string, string>,
    integration: Integration
  ): Promise<LLMMessage[]> {
    const docs = await integrationManager.getDocumentation();
    
    const userPrompt = getGenerateStepConfigContext({
      instruction: config.instruction,
      previousStepConfig: config,
      previousStepDataSelector: loopSelector,
      stepInput: payload,
      credentials,
      integrationDocumentation: docs?.content || '',
      integrationSpecificInstructions: integration.specificInstructions || ''
    }, { characterBudget: 50000, mode: 'self-healing' });

    return [
      { role: "system", content: GENERATE_STEP_CONFIG_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];
  }

  private async validateStepResponse(
    data: any,
    config: ApiConfig,
    integrationManager: IntegrationManager
  ): Promise<void> {
    const evaluation = await this.evaluateStepResponse({
      data,
      config,
      docSearchResultsForStepInstruction: await integrationManager?.searchDocumentation(config.instruction)
    });
    
    if (!evaluation.success) {
      throw new Error(evaluation.shortReason + " " + JSON.stringify(data).slice(0, 10000));
    }
  }

  private handleMaxRetriesExceeded(
    stepId: string,
    config: ApiConfig,
    retryCount: number,
    lastError: string,
  ): never {
    telemetryClient?.captureException(
      new Error(`API call failed after ${retryCount} attempts: ${lastError}`), 
      this.metadata?.orgId,
      { config, retryCount }
    );
    throw new ApiCallError(
      `Error executing step ${stepId}: ${lastError}`, 
      500
    );
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

      if (!step.apiConfig) {
        throw new Error("Each step must have an API config");
      }
    }
  }

  private buildAggregatedStepData(originalPayload: Record<string, unknown>): Record<string, unknown> {
    const stepResults: Record<string, unknown> = {};
    
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

  private completeWithSuccess(): ToolResult {
    this.result.success = true;
    this.result.error = undefined;
    this.result.completedAt = new Date();
    return this.result;
  }

  private completeWithFailure(error: any): ToolResult {
    this.result.success = false;
    this.result.error = error;
    this.result.completedAt = new Date();
    return this.result;
  }

  private async evaluateStepResponse({
    data,
    config,
    docSearchResultsForStepInstruction
  }: {
    data: any,
    config: ApiConfig,
    docSearchResultsForStepInstruction?: string
  }): Promise<{ success?: boolean; refactorNeeded?: boolean; shortReason?: string }> {
  
    const evaluateStepResponsePrompt = getEvaluateStepResponseContext({ data, config, docSearchResultsForStepInstruction }, { characterBudget: 20000 });
  
    const messages = [
      {
        role: "system",
        content: EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT
      },
      {
        role: "user", content: evaluateStepResponsePrompt
      }
    ] as LLMMessage[];
  
    const evaluationSchema = z.object({
      success: z.boolean().describe("Whether the step execution was successful"),
      refactorNeeded: z.boolean().describe("Whether the configuration needs to be refactored"),
      shortReason: z.string().describe("Brief reason for the evaluation result")
    });

    const evaluationResult = await LanguageModel.generateObject<z.infer<typeof evaluationSchema>>(
      { messages: messages, schema: zodToJsonSchema(evaluationSchema), temperature: 0 });
    
    if (!evaluationResult.success) {
      throw new Error(`Error evaluating config response: ${evaluationResult.response}`);
    }
    
    return evaluationResult.response;
  }

}

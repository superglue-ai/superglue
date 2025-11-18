import { ApiConfig, ExecutionStep, Integration, RequestOptions, Workflow as Tool, WorkflowResult as ToolResult, WorkflowStepResult as ToolStepResult } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { getEvaluateStepResponseContext, getGenerateStepConfigContext, getLoopSelectorContext as getDataSelectorContext } from "../context/context-builders.js";
import { EVALUATE_STEP_RESPONSE_SYSTEM_PROMPT, GENERATE_STEP_CONFIG_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { server_defaults } from "../default.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel, LLMMessage } from "../llm/llm-base-model.js";
import { logMessage } from "../utils/logs.js";
import { telemetryClient } from "../utils/telemetry.js";
import { isSelfHealingEnabled, maskCredentials, transformData } from "../utils/helpers.js";
import { executeAndEvaluateFinalTransform, generateWorkingTransform } from "./tool-transform.js";
import { AbortError, ApiCallError, HttpStepExecutionStrategy } from "./strategies/http/http.js";
import { generateStepConfig } from "./tool-step-builder.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { StepExecutionStrategy, StepExecutionStrategyRegistry } from "./strategies/strategy.js";

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
  private integrations: Record<string, IntegrationManager>;
  private stepExecutionStrategies: StepExecutionStrategy[];
  
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

    this.result = {
      id: crypto.randomUUID(),
      success: false,
      data: {},
      stepResults: [],
      startedAt: new Date(),
      completedAt: undefined,
      config: tool,
    } as ToolResult;

    const registry = new StepExecutionStrategyRegistry();
    registry.register(new HttpStepExecutionStrategy());
    this.stepExecutionStrategies = registry.getStrategies();
  }

  
  public async execute({ payload = {}, credentials = {}, options = {} }: { payload?: Record<string, any>, credentials?: Record<string, string>, options?: RequestOptions }): Promise<ToolResult> {
    try {
      this.validate({ payload, credentials });
      logMessage("debug", `Executing tool ${this.id}`, this.metadata);

      for (const step of this.steps) {
        const aggregatedStepData = this.buildAggregatedStepData(payload);
        const stepResult = await this.executeStep({ step, stepInput: aggregatedStepData, credentials, options });
        this.result.stepResults.push(stepResult);
        
        step.apiConfig = stepResult.config;

        if (!stepResult.success) {
          return this.completeWithFailure(stepResult.error);
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
          steps: this.steps,
          finalTransform: finalTransformResult.successfulTransformCode,
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
  }): Promise<ToolStepResult> {
    try {
      const { dataSelectorItems, successfulDataSelector, isArray } = await this.getDataSelectorOutput({ step, stepInput, options });
      step.loopSelector = successfulDataSelector;

      const stepResults = [];
      const integrationManager = this.integrations[step.integrationId];
      const isSelfHealing = isSelfHealingEnabled(options, "api");
      const maxRetries = isSelfHealing 
        ? (options?.retries !== undefined ? options.retries : server_defaults.MAX_CALL_RETRIES) 
        : 1;

      for (let i = 0; i < dataSelectorItems.length; i++) {
        const currentItem = dataSelectorItems[i] || "";
        
        if (dataSelectorItems.length > 1) {
          logMessage("debug", `Executing loop iteration ${i + 1}/${dataSelectorItems.length} with item: ${JSON.stringify(currentItem).slice(0, 100)}...`, this.metadata);
        } else if (dataSelectorItems.length === 1 && currentItem && Object.keys(currentItem).length > 0) {
          logMessage("debug", `Executing step ${step.id} with item: ${JSON.stringify(currentItem).slice(0, 200)}...`, this.metadata);
        }

        const loopPayload = { currentItem, ...stepInput };
        let retryCount = 0;
        let lastError: string | null = null;
        let messages: LLMMessage[] = [];
        let currentConfig = step.apiConfig;
        let iterationResult: any = null;
        let cachedIntegration: Integration | undefined;

        while (retryCount < maxRetries) {
          try {
            if (retryCount > 0 && isSelfHealing) {
              logMessage('info', `Self healing step config (retry ${retryCount})`, this.metadata);

              if (messages.length === 0) {
                cachedIntegration = await integrationManager.getIntegration();
                messages = await this.initializeSelfHealingContext(
                  integrationManager,
                  currentConfig,
                  loopPayload,
                  credentials,
                  cachedIntegration
                );
              }

              const generateResult = await generateStepConfig({
                retryCount,
                messages,
                integration: cachedIntegration
              });
              
              if (!generateResult.success) {
                throw new Error(generateResult.error);
              }

              currentConfig = { ...currentConfig, ...generateResult.config } as ApiConfig;
            }

            const stepExecutionStrategy = this.stepExecutionStrategies.find(s => s.shouldExecute(currentConfig));
            
            if (!stepExecutionStrategy) {
              throw new Error("No execution strategy found for this step configuration");
            }

            const stepExecutionResult = await stepExecutionStrategy.executeStep({
              stepConfig: currentConfig,
              stepInputData: loopPayload,
              credentials,
              requestOptions: { ...options, testMode: false }
            });

            if (!stepExecutionResult.success || !stepExecutionResult.data?.data) {
              throw new Error(stepExecutionResult.error || "No data returned from step");
            }

            if ((retryCount > 0 && isSelfHealing) || options.testMode) {
              await this.validateStepResponse(
                stepExecutionResult.data.data,
                currentConfig,
                integrationManager
              );
            }

            iterationResult = stepExecutionResult.data;
            
            if (currentConfig !== step.apiConfig) {
              logMessage("debug", `Loop iteration ${i + 1} updated configuration`, this.metadata);
              step.apiConfig = currentConfig;
            }
            break;

          } catch (error) {
            lastError = maskCredentials(error?.message || String(error), credentials).slice(0, 10000);
            
            if (retryCount > 0) {
              messages.push({ role: "user", content: `Error: ${lastError}` });
              logMessage('info', `API call failed: ${lastError}`, this.metadata);
            }

            if (error instanceof AbortError) throw error;

            retryCount++;
            
            if (retryCount >= maxRetries) {
              this.handleMaxRetriesExceeded(currentConfig, retryCount, lastError, i, dataSelectorItems.length);
            }
          }
        }

        const stepResponseData = { 
          currentItem, 
          data: iterationResult.data, 
          ...(typeof iterationResult.data === 'object' && !Array.isArray(iterationResult.data) ? iterationResult.data : {}) 
        };
        
        stepResults.push({
          stepId: step.id,
          success: true,
          stepResponseData,
          config: currentConfig
        });
      }

      logMessage("info", `'${step.id}' Complete`, this.metadata);
      
      return {
        stepId: step.id,
        success: true,
        rawData: isArray ? stepResults.map(r => r.stepResponseData) : stepResults[0]?.stepResponseData || null,
        transformedData: isArray ? stepResults.map(r => r.stepResponseData) : stepResults[0]?.stepResponseData || null,
        config: step.apiConfig,
        error: undefined
      };
    } catch (error) {
      logMessage("info", `'${step.id}' Failed`, this.metadata);
      
      return {
        stepId: step.id,
        success: false,
        rawData: null,
        transformedData: null,
        config: step.apiConfig,
        error: error.message || error
      };
    }
  }

  private async getDataSelectorOutput({ 
    step, 
    stepInput, 
    options 
  }: { 
    step: ExecutionStep, 
    stepInput: Record<string, any>, 
    options: RequestOptions 
  }): Promise<{ dataSelectorItems: any[], successfulDataSelector: string, isArray: boolean }> {
    const dataSelectorResult = await transformData(stepInput, step.loopSelector);
    
    const isArray = Array.isArray(dataSelectorResult.data);
    let dataSelectorItems: any[] = [];
    
    if (isArray) {
      dataSelectorItems = dataSelectorResult.data;
    } else if (dataSelectorResult.data) {
      dataSelectorItems = [dataSelectorResult.data];
    } else {
      dataSelectorItems = [{}];
    }

    if (!dataSelectorResult.success) {
      if (!isSelfHealingEnabled(options, "api")) {
        logMessage("error", `Loop selector for '${step.id}' failed. ${dataSelectorResult.error}\nCode: ${step.loopSelector}\nPayload: ${JSON.stringify(stepInput).slice(0, 1000)}...`, this.metadata);
        throw new Error(`Loop selector for '${step.id}' failed. Check the loop selector code or enable self-healing and re-execute to regenerate automatically.`);
      }

      const dataSelectorPrompt = getDataSelectorContext({ 
        step, 
        payload: stepInput, 
        instruction: step.apiConfig.instruction 
      }, { characterBudget: 20000 });
      
      const transformResult = await generateWorkingTransform({
        targetSchema: {},
        inputData: stepInput,
        instruction: dataSelectorPrompt,
        metadata: this.metadata
      });

      if (!transformResult) {
        throw new Error("Failed to generate loop selector");
      }

      step.loopSelector = transformResult.transformCode;
      const retryResult = await transformData(stepInput, step.loopSelector);
      dataSelectorItems = retryResult.data;

      if (!retryResult.success || !Array.isArray(dataSelectorItems)) {
        throw new Error("Failed to generate loop selector");
      }
    }

    dataSelectorItems = dataSelectorItems.slice(0, step.loopMaxIters || server_defaults.DEFAULT_LOOP_MAX_ITERS);
    return { dataSelectorItems, successfulDataSelector: step.loopSelector, isArray };
  }
  

  private async initializeSelfHealingContext(
    integrationManager: IntegrationManager,
    config: ApiConfig,
    payload: any,
    credentials: Record<string, string>,
    integration: Integration
  ): Promise<LLMMessage[]> {
    const docs = await integrationManager.getDocumentation();
    
    const userPrompt = getGenerateStepConfigContext({
      instruction: config.instruction,
      previousStepConfig: config,
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
    config: ApiConfig,
    retryCount: number,
    lastError: string,
    iterationIndex: number,
    totalIterations: number
  ): never {
    telemetryClient?.captureException(
      new Error(`API call failed after ${retryCount} attempts: ${lastError}`), 
      this.metadata?.orgId,
      { config, retryCount }
    );
    throw new ApiCallError(
      `Error processing item ${iterationIndex + 1}/${totalIterations}: ${lastError}`, 
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

    if (!this.stepExecutionStrategies || !Array.isArray(this.stepExecutionStrategies)) {
      throw new Error("Step execution strategies must be an array");
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
      if (result?.transformedData) {
        stepResults[result.stepId] = result.transformedData;
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

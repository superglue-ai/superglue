import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";
import type {
  ExecutionPlan,
  ExecutionStep,
  StepAnalysis,
  StepMapping,
  VariableMapping,
  WorkflowResult,
} from "../domain/workflow.types.js";
import { DataExtractor } from "./dataExtractor.js";
import {
  executeApiCall,
  extractTemplateVariables,
  prepareApiConfig,
  processStepResult,
  storeStepResult,
} from "./workflowUtils.js";

export abstract class WorkflowExecutionStrategy {
  constructor(
    protected step: ExecutionStep,
    protected stepMapping: StepMapping | undefined,
    protected executionPlan: ExecutionPlan,
    protected result: WorkflowResult,
    protected apiDocumentation: string,
    protected baseApiInput?: ApiInput,
  ) {}

  abstract execute(
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean>;

  protected async executeApiCall(
    apiConfig: ApiConfig,
    callPayload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<unknown> {
    return executeApiCall(apiConfig, callPayload, credentials, this.step.id, options);
  }

  protected extractTemplateVariables(text: string): string[] {
    return extractTemplateVariables(text);
  }

  protected async processStepResult(result: unknown): Promise<unknown> {
    return processStepResult(this.step.id, result, this.stepMapping);
  }

  /**
   * Store a step result in the workflow result
   */
  protected storeStepResult(rawData: unknown, transformedData: unknown, success: boolean, error?: string): void {
    storeStepResult(this.step.id, this.result, rawData, transformedData, success, error);
  }

  /**
   * Prepare the API config for a step
   */
  protected async prepareApiConfig(urlPath: string = this.step.endpoint): Promise<ApiConfig> {
    return prepareApiConfig(this.step, this.executionPlan, this.apiDocumentation, this.baseApiInput, urlPath);
  }
}

/**
 * Strategy for direct execution (single API call with specific values)
 */
export class DirectExecutionStrategy extends WorkflowExecutionStrategy {
  async execute(
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean> {
    try {
      // Prepare the API config
      const apiConfig = await this.prepareApiConfig();

      // Prepare the payload with template variables
      const templateVars = this.extractTemplateVariables(this.step.endpoint);
      const enhancedPayload = { ...payload };

      // Add template variables from previous steps or payload
      for (const varName of templateVars) {
        // Skip if already in payload
        if (varName in enhancedPayload) continue;

        // Try to find in previous steps
        if (this.step.dependencies) {
          for (const depId of this.step.dependencies) {
            const depResult = this.result.stepResults[depId]?.transformedData;

            if (depResult && typeof depResult === "object") {
              const extractor = new DataExtractor(depResult as Record<string, unknown>);
              const value = extractor.findValue(varName);

              if (value !== undefined) {
                enhancedPayload[varName] = value;
                break;
              }
            }
          }
        }
      }

      // Execute the API call
      const apiResponse = await this.executeApiCall(apiConfig, enhancedPayload, credentials, options);

      // Process the result
      const processedResult = await this.processStepResult(apiResponse);

      // Store result
      this.storeStepResult(apiResponse, processedResult, true);

      return true;
    } catch (error) {
      console.error(`Error in DirectExecutionStrategy for step ${this.step.id}:`, error);
      this.storeStepResult(undefined, undefined, false, String(error));
      return false;
    }
  }
}

/**
 * Strategy for loop execution (multiple API calls, one for each value in an array)
 */
export class LoopExecutionStrategy extends WorkflowExecutionStrategy {
  constructor(
    step: ExecutionStep,
    stepMapping: StepMapping | undefined,
    executionPlan: ExecutionPlan,
    result: WorkflowResult,
    apiDocumentation: string,
    private stepAnalysis: StepAnalysis,
    baseApiInput?: ApiInput,
  ) {
    super(step, stepMapping, executionPlan, result, apiDocumentation, baseApiInput);
  }

  async execute(
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean> {
    try {
      // Find the loop variable and its values from the step analysis
      const [loopVarName, loopMapping] = this.findLoopVariable();

      if (!loopVarName || !loopMapping) {
        console.error(`❌ [LOOP] No loop variable found for step ${this.step.id}`);
        this.storeStepResult(undefined, undefined, false, "No loop variable found");
        return false;
      }

      console.log(`🔄 [LOOP] Step '${this.step.id}' - Using variable '${loopVarName}' from '${loopMapping.source}'`);

      // Get loop values
      const loopValues = await this.getLoopValues(loopMapping, loopVarName, payload);

      if (loopValues.length === 0) {
        console.error(`❌ [LOOP] No values found for loop variable '${loopVarName}'`);
        this.storeStepResult(undefined, undefined, false, "No loop values found");
        return false;
      }

      console.log(`🔄 [LOOP] Found ${loopValues.length} values, using '${loopValues[0]}'`);

      // For simplicity in this PoC, we'll just use the first value
      // In a real implementation, we'd handle multiple values and combine results
      const loopValue = loopValues[0];

      // Prepare the API config
      const apiConfig = await this.prepareApiConfig();

      // Create payload with the loop variable
      const loopPayload = {
        ...payload,
        [loopVarName]: loopValue,
      };

      // Execute the API call with the loop value
      const apiResponse = await this.executeApiCall(apiConfig, loopPayload, credentials, options);

      // Process the result
      const processedResult = await this.processStepResult(apiResponse);

      // Store the result
      this.storeStepResult(apiResponse, processedResult, true);

      return true;
    } catch (error) {
      console.error(`❌ [LOOP] Error in step ${this.step.id}: ${String(error)}`);
      this.storeStepResult(undefined, undefined, false, String(error));
      return false;
    }
  }

  /**
   * Find the variable to loop over from the step analysis
   */
  private findLoopVariable(): [string, VariableMapping | undefined] {
    for (const [varName, mapping] of Object.entries(this.stepAnalysis.variableMapping)) {
      if (mapping.isArray) {
        return [varName, mapping];
      }
    }
    return ["", undefined];
  }

  /**
   * Get values to loop over based on the variable mapping
   */
  private async getLoopValues(
    mapping: VariableMapping,
    loopVarName: string,
    payload: Record<string, unknown>,
  ): Promise<any[]> {
    // If selected values are provided, use those
    if (mapping.selectedValues && mapping.selectedValues.length > 0) {
      return mapping.selectedValues;
    }

    // If source is payload, get values from there
    if (mapping.source === "payload") {
      const payloadValue = payload[loopVarName];
      if (Array.isArray(payloadValue)) {
        return payloadValue;
      } else if (payloadValue !== undefined) {
        return [payloadValue];
      }
      return [];
    }

    // Get values from a previous step
    const sourceResult = this.result.stepResults[mapping.source]?.transformedData;
    if (!sourceResult) {
      return [];
    }

    // Extract the values using the data extractor
    const extractor = new DataExtractor(sourceResult as Record<string, unknown>);
    const values = extractor.extractValues(mapping.path);

    return values;
  }
}

/**
 * Strategy for filter execution (filtering results before processing)
 */
export class FilterExecutionStrategy extends WorkflowExecutionStrategy {
  constructor(
    step: ExecutionStep,
    stepMapping: StepMapping | undefined,
    executionPlan: ExecutionPlan,
    result: WorkflowResult,
    apiDocumentation: string,
    private stepAnalysis: StepAnalysis,
    baseApiInput?: ApiInput,
  ) {
    super(step, stepMapping, executionPlan, result, apiDocumentation, baseApiInput);
  }

  async execute(
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean> {
    // For now, this is just a placeholder for future implementation
    // In a real implementation, this would filter results from previous steps
    console.log(`Filter execution not fully implemented yet for step ${this.step.id}`);

    // Fall back to direct execution
    const directStrategy = new DirectExecutionStrategy(
      this.step,
      this.stepMapping,
      this.executionPlan,
      this.result,
      this.apiDocumentation,
      this.baseApiInput,
    );

    return await directStrategy.execute(payload, credentials, options);
  }
}

// biome-ignore lint/complexity/noStaticOnlyClass: Decider class - whats a TS way?
export class ExecutionStrategyFactory {
  static createStrategy(
    step: ExecutionStep,
    stepMapping: StepMapping | undefined,
    executionPlan: ExecutionPlan,
    result: WorkflowResult,
    apiDocumentation: string,
    stepAnalysis: StepAnalysis,
    baseApiInput?: ApiInput,
  ): WorkflowExecutionStrategy {
    const mode = stepAnalysis.executionMode;

    switch (mode) {
      case "LOOP":
        return new LoopExecutionStrategy(
          step,
          stepMapping,
          executionPlan,
          result,
          apiDocumentation,
          stepAnalysis,
          baseApiInput,
        );
      case "FILTER":
        return new FilterExecutionStrategy(
          step,
          stepMapping,
          executionPlan,
          result,
          apiDocumentation,
          stepAnalysis,
          baseApiInput,
        );
      // biome-ignore lint/correctness/noUselessSwitchCase: for clarity
      case "DIRECT":
      default:
        return new DirectExecutionStrategy(step, stepMapping, executionPlan, result, apiDocumentation, baseApiInput);
    }
  }
}

import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";
import { callEndpoint, generateApiConfig } from "../../../utils/api.js";
import { applyJsonataWithValidation } from "../../../utils/tools.js";
import type {
  ExecutionPlan,
  ExecutionStep,
  StepAnalysis,
  StepMapping,
  VariableMapping,
  WorkflowResult,
} from "../domain/workflow.types.js";
import { DataExtractor } from "./dataExtractor.js";

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
    try {
      if (apiConfig.urlPath?.includes("${")) {
        const templateVars = this.extractTemplateVariables(apiConfig.urlPath);

        for (const varName of templateVars) {
          if (!(varName in callPayload)) {
            throw new Error(`The following variables are not defined: ${varName}`);
          }
        }

        // Replace template variables in the URL path
        let processedPath = apiConfig.urlPath;
        for (const varName of templateVars) {
          const value = callPayload[varName];
          processedPath = processedPath.replace(`\${${varName}}`, String(value));
        }

        // Update the API config with the processed path
        apiConfig = {
          ...apiConfig,
          urlPath: processedPath,
        };

        console.log(
          `[API Call] ${this.step.id}: ${apiConfig.urlPath} (with ${templateVars[0]}=${callPayload[templateVars[0]]})`,
        );
      }

      const result = await callEndpoint(apiConfig, callPayload, credentials, options || { timeout: 60000 });
      return result.data;
    } catch (error) {
      console.error(`Error calling '${apiConfig.id}': ${String(error)}`);
      throw new Error(`API call '${apiConfig.id}' failed: ${String(error)}`);
    }
  }

  protected extractTemplateVariables(text: string): string[] {
    const matches = text.match(/\$\{([^}]+)\}/g) || [];
    return matches.map((match) => match.slice(2, -1));
  }

  protected async processStepResult(result: unknown): Promise<unknown> {
    try {
      // If there's no mapping or it's the identity mapping, return as-is
      if (!this.stepMapping?.responseMapping || this.stepMapping.responseMapping === "$") {
        return result;
      }

      // Apply the transformation
      const transformResult = await applyJsonataWithValidation(result, this.stepMapping.responseMapping, undefined);

      if (!transformResult.success) {
        console.error(`❌ [Mapping Error] Step '${this.step.id}' - Failed to apply response mapping`);
        throw new Error(`Response mapping failed: ${transformResult.error}`);
      }

      console.log(`📝 [Transform] Step '${this.step.id}' - Applied response mapping`);
      return transformResult.data;
    } catch (error) {
      console.error(`❌ [Mapping Error] Step '${this.step.id}' - ${String(error)}`);
      return result;
    }
  }

  /**
   * Store a step result in the workflow result
   */
  protected storeStepResult(rawData: unknown, transformedData: unknown, success: boolean, error?: string): void {
    const stepResult = {
      stepId: this.step.id,
      success,
      rawData,
      transformedData,
      error,
    };

    this.result.stepResults[this.step.id] = stepResult;

    if (success) {
      // Update the aggregated data
      this.result.data[this.step.id] = transformedData;
      console.log(`✅ [Result] Step '${this.step.id}' - Complete`);
    } else {
      console.error(`❌ [Result] Step '${this.step.id}' - Failed: ${error}`);
    }
  }

  /**
   * Prepare the API config for a step
   */
  protected async prepareApiConfig(urlPath: string = this.step.endpoint): Promise<ApiConfig> {
    // Use manually configured API if available
    if (this.step.apiConfig) {
      return this.step.apiConfig;
    }

    // Otherwise, generate it from the step information
    const apiInput: ApiInput = {
      ...(this.baseApiInput || {}),
      urlHost: this.executionPlan.apiHost,
      urlPath: urlPath,
      method: this.step.method as any,
      instruction: this.step.description,
    };

    // Make sure we have documentation
    if (!this.apiDocumentation) {
      throw new Error("No API documentation available. Please call retrieveApiDocumentation first.");
    }

    // Generate API config
    const { config } = await generateApiConfig(apiInput, this.apiDocumentation);
    return config;
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
      this.result.stepResults[this.step.id] = {
        stepId: this.step.id,
        success: true,
        rawData: apiResponse,
        transformedData: processedResult,
      };

      // Update the aggregated data
      this.result.data[this.step.id] = processedResult;
      console.log(`✅ [LOOP] Step '${this.step.id}' - Complete`);

      return true;
    } catch (error) {
      console.error(`❌ [LOOP] Error in step ${this.step.id}: ${String(error)}`);
      this.result.stepResults[this.step.id] = {
        stepId: this.step.id,
        success: false,
        error: String(error),
      };
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

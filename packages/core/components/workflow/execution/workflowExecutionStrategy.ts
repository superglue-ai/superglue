import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";
import type {
  ExecutionPlan,
  ExecutionStep,
  StepAnalysis,
  StepMapping,
  VariableMapping,
  WorkflowResult,
} from "../domain/workflow.types.js";
import { extractValues, findValue } from "./dataExtractor.js";
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
    return executeApiCall(apiConfig, callPayload, credentials, options);
  }

  protected extractTemplateVariables(text: string): string[] {
    return extractTemplateVariables(text);
  }

  protected async processStepResult(result: unknown): Promise<unknown> {
    return processStepResult(this.step.id, result, this.stepMapping);
  }

  protected storeStepResult(rawData: unknown, transformedData: unknown, success: boolean, error?: string): void {
    storeStepResult(this.step.id, this.result, rawData, transformedData, success, error);
  }

  protected async prepareApiConfig(urlPath: string = this.step.endpoint): Promise<ApiConfig> {
    return prepareApiConfig(this.step, this.executionPlan, this.apiDocumentation, this.baseApiInput, urlPath);
  }
}

export class DirectExecutionStrategy extends WorkflowExecutionStrategy {
  async execute(
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<boolean> {
    try {
      const apiConfig = await this.prepareApiConfig();

      const templateVars = this.extractTemplateVariables(this.step.endpoint);
      const enhancedPayload = { ...payload };

      // Add template variables from previous steps or payload
      for (const varName of templateVars) {
        // Skip if already in payload
        if (varName in enhancedPayload) continue;

        // Try to find in previous steps
        for (const [stepId, stepResult] of Object.entries(this.result.stepResults)) {
          const depResult = stepResult?.transformedData;
          if (depResult && typeof depResult === "object") {
            const value = findValue(depResult as Record<string, unknown>, varName);
            if (value !== undefined) {
              enhancedPayload[varName] = value;
              break;
            }
          }
        }
      }

      const apiResponse = await this.executeApiCall(apiConfig, enhancedPayload, credentials, options);
      const processedResult = await this.processStepResult(apiResponse);
      this.storeStepResult(apiResponse, processedResult, true);

      return true;
    } catch (error) {
      console.error(`Error in DirectExecutionStrategy for step ${this.step.id}:`, error);
      this.storeStepResult(undefined, undefined, false, String(error));
      return false;
    }
  }
}

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
        console.error(`[LOOP] No loop variable found for step ${this.step.id}`);
        this.storeStepResult(undefined, undefined, false, "No loop variable found");
        return false;
      }

      console.log(`[LOOP] Step '${this.step.id}' - Using variable '${loopVarName}' from '${loopMapping.source}'`);
      const loopValues = await this.getLoopValues(loopMapping, loopVarName, payload);

      if (loopValues.length === 0) {
        console.error(`[LOOP] No values found for loop variable '${loopVarName}'`);
        this.storeStepResult(undefined, undefined, false, "No loop values found");
        return false;
      }

      let effectiveLoopValues = loopValues;
      if (this.step.loopMaxIters !== undefined && this.step.loopMaxIters >= 0) {
        effectiveLoopValues = loopValues.slice(0, this.step.loopMaxIters);
      }

      console.log(`[LOOP] Found ${effectiveLoopValues.length} values, example: '${effectiveLoopValues[0]}'`);
      const apiConfig = await this.prepareApiConfig();
      const results = [];

      for (let i = 0; i < effectiveLoopValues.length; i++) {
        const loopValue = effectiveLoopValues[i];
        console.log(`[LOOP] Processing value ${i + 1}/${effectiveLoopValues.length}: ${loopValue}`);

        const loopPayload = {
          ...payload,
          [loopVarName]: loopValue,
        };

        try {
          const apiResponse = await this.executeApiCall(apiConfig, loopPayload, credentials, options);
          const processedResult = await this.processStepResult(apiResponse);
          results.push({ raw: apiResponse, processed: processedResult });
        } catch (callError) {
          console.error(`[LOOP] Error processing value '${loopValue}': ${String(callError)}`);
          // Continue with other values even if one fails
        }
      }

      if (results.length === 0) {
        console.error(`[LOOP] All API calls failed for step ${this.step.id}`);
        this.storeStepResult(undefined, undefined, false, "All loop iterations failed");
        return false;
      }

      const rawResponses = results.map((r) => r.raw);
      const processedResults = results.map((r) => r.processed);

      this.storeStepResult(rawResponses, processedResults, true);

      return true;
    } catch (error) {
      console.error(`[LOOP] Error in step ${this.step.id}: ${String(error)}`);
      this.storeStepResult(undefined, undefined, false, String(error));
      return false;
    }
  }

  private findLoopVariable(): [string, VariableMapping | undefined] {
    // If the step has a loopVariable defined, use it first
    if (this.step.loopVariable) {
      console.log(`Using explicitly configured loop variable: ${this.step.loopVariable}`);

      // Find this variable in the mappings
      const mapping = this.stepAnalysis.variableMapping[this.step.loopVariable];
      if (mapping) {
        return [this.step.loopVariable, mapping];
      }

      // If we have the name but no mapping, create a default mapping
      // looking for the variable in previous steps
      const previousStepIds = Object.keys(this.result.stepResults);
      if (previousStepIds.length > 0) {
        // Use the most recent step as the source
        const lastStepId = previousStepIds[previousStepIds.length - 1];
        const defaultMapping: VariableMapping = {
          source: lastStepId,
          path: this.step.loopVariable,
          isArray: true,
        };
        return [this.step.loopVariable, defaultMapping];
      }
    }

    // Otherwise, find first array variable in mappings
    for (const [varName, mapping] of Object.entries(this.stepAnalysis.variableMapping)) {
      if (mapping.isArray) {
        return [varName, mapping];
      }
    }
    return ["", undefined];
  }

  private async getLoopValues(
    mapping: VariableMapping,
    loopVarName: string,
    payload: Record<string, unknown>,
  ): Promise<any[]> {
    if (mapping.selectedValues && mapping.selectedValues.length > 0) {
      console.log(`[LOOP] Using explicitly selected values: ${mapping.selectedValues.length} items`);
      return mapping.selectedValues;
    }

    // If source is payload, get values from there
    if (mapping.source === "payload") {
      const payloadValue = payload[loopVarName];
      if (Array.isArray(payloadValue)) {
        console.log(`[LOOP] Using array from payload: ${payloadValue.length} items`);
        return payloadValue;
      }

      if (payloadValue !== undefined) {
        console.log("[LOOP] Using single value from payload");
        return [payloadValue];
      }
      return [];
    }

    // Get values from a previous step
    const sourceResult = this.result.stepResults[mapping.source]?.transformedData;
    if (!sourceResult) {
      console.log(`[LOOP] No data found for source step ${mapping.source}`);
      return [];
    }

    // Find the source step to check configuration for extracting array values
    const sourceStep = this.executionPlan.steps.find((s) => s.id === mapping.source);

    // Extract values using multiple strategies, in order of specificity
    if (sourceStep) {
      // 1. If we have configuration from the source step, use it

      // Check responseField and objectKeysAsArray flag first - this is a common pattern for APIs
      if (sourceStep.responseField && typeof sourceResult === "object" && sourceResult !== null) {
        const fieldName = sourceStep.responseField;
        if (fieldName in (sourceResult as Record<string, unknown>)) {
          const fieldValue = (sourceResult as Record<string, unknown>)[fieldName];

          // If fieldValue is an object and objectKeysAsArray is true, use its keys
          if (
            sourceStep.objectKeysAsArray &&
            fieldValue &&
            typeof fieldValue === "object" &&
            !Array.isArray(fieldValue)
          ) {
            const keys = Object.keys(fieldValue as Record<string, unknown>);
            console.log(`[LOOP] Using keys from responseField '${fieldName}': ${keys.length} keys`);
            return keys;
          }

          // If fieldValue is an array, use it directly
          if (Array.isArray(fieldValue)) {
            console.log(`[LOOP] Using array from responseField '${fieldName}': ${fieldValue.length} items`);
            return fieldValue;
          }
        }
      }

      // Check for arrayPath - used to navigate to a nested array
      if (sourceStep.arrayPath && typeof sourceResult === "object" && sourceResult !== null) {
        let currentValue: unknown = sourceResult;
        const pathParts = sourceStep.arrayPath.split(".");

        for (const part of pathParts) {
          if (currentValue && typeof currentValue === "object" && part in (currentValue as Record<string, unknown>)) {
            currentValue = (currentValue as Record<string, unknown>)[part];
          } else {
            currentValue = undefined;
            break;
          }
        }

        if (Array.isArray(currentValue)) {
          console.log(`[LOOP] Found array at path '${sourceStep.arrayPath}': ${currentValue.length} items`);
          return currentValue;
        }

        // Path led to an object, if objectKeysAsArray is true, return its keys
        if (sourceStep.objectKeysAsArray && currentValue && typeof currentValue === "object") {
          const keys = Object.keys(currentValue as Record<string, unknown>);
          console.log(`[LOOP] Using keys at path '${sourceStep.arrayPath}': ${keys.length} keys`);
          return keys;
        }
      }

      // Direct use of outputIsArray and objectKeysAsArray flags
      if (sourceStep.outputIsArray && sourceStep.objectKeysAsArray) {
        if (typeof sourceResult === "object" && sourceResult !== null && !Array.isArray(sourceResult)) {
          const keys = Object.keys(sourceResult as Record<string, unknown>);
          console.log(`[LOOP] Using object keys from root: ${keys.length} keys`);
          return keys;
        }
      }
    }

    // 2. General fallback strategies when step config doesn't produce results
    // Try using data extractor with the provided path
    try {
      const values = extractValues(sourceResult as Record<string, unknown>, mapping.path);

      if (values.length > 0) {
        console.log(`[LOOP] Extracted ${values.length} values using path '${mapping.path}'`);
        return values;
      }
    } catch (error) {
      console.warn(`[LOOP] Error extracting values using path '${mapping.path}'`);
    }

    // Check if the source has a property matching the loop variable name
    if (
      typeof sourceResult === "object" &&
      !Array.isArray(sourceResult) &&
      sourceResult !== null &&
      loopVarName in (sourceResult as Record<string, unknown>)
    ) {
      const varValue = (sourceResult as Record<string, unknown>)[loopVarName];
      if (Array.isArray(varValue)) {
        console.log(`[LOOP] Found array property matching variable name: ${varValue.length} items`);
        return varValue;
      }
    }

    // If sourceStep has objectKeysAsArray (even if we didn't reach the location via other means)
    if (
      sourceStep?.objectKeysAsArray &&
      typeof sourceResult === "object" &&
      sourceResult !== null &&
      !Array.isArray(sourceResult)
    ) {
      const keys = Object.keys(sourceResult as Record<string, unknown>);
      console.log(`[LOOP] Using object keys from source result: ${keys.length} keys`);
      return keys;
    }

    // If the source result itself is an array, use it
    if (Array.isArray(sourceResult)) {
      console.log(`[LOOP] Source result is already an array: ${sourceResult.length} items`);
      return sourceResult;
    }

    // Try to find any array in the source result's properties
    if (typeof sourceResult === "object" && sourceResult !== null) {
      for (const [key, value] of Object.entries(sourceResult)) {
        if (Array.isArray(value) && value.length > 0) {
          console.log(`[LOOP] Found array in property '${key}': ${value.length} items`);
          return value;
        }
      }
    }

    console.log(`[LOOP] No array values found for loop variable '${loopVarName}'`);
    return [];
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
    stepAnalysis?: StepAnalysis,
    baseApiInput?: ApiInput,
  ): WorkflowExecutionStrategy {
    if (step.executionMode === "LOOP") {
      if (!stepAnalysis) {
        throw new Error("Step analysis is required for LOOP execution mode");
      }
      return new LoopExecutionStrategy(
        step,
        stepMapping,
        executionPlan,
        result,
        apiDocumentation,
        stepAnalysis,
        baseApiInput,
      );
    }
    return new DirectExecutionStrategy(step, stepMapping, executionPlan, result, apiDocumentation, baseApiInput);
  }
}

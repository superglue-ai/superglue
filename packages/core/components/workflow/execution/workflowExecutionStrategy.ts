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
    return executeApiCall(apiConfig, callPayload, credentials, options);
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
        for (const [stepId, stepResult] of Object.entries(this.result.stepResults)) {
          const depResult = stepResult?.transformedData;
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

      let effectiveLoopValues = loopValues;
      if (this.step.loopMaxIters !== undefined && this.step.loopMaxIters >= 0) {
        effectiveLoopValues = loopValues.slice(0, this.step.loopMaxIters);
        if (effectiveLoopValues.length < loopValues.length) {
          console.log(`🔄 [LOOP] Limiting to ${effectiveLoopValues.length} of ${loopValues.length} values due to loopMaxIters=${this.step.loopMaxIters}`);
        }
      }

      console.log(`🔄 [LOOP] Found ${effectiveLoopValues.length} values, example: '${effectiveLoopValues[0]}'`);

      const apiConfig = await this.prepareApiConfig();
      const results = [];

      for (let i = 0; i < effectiveLoopValues.length; i++) {
        const loopValue = effectiveLoopValues[i];
        console.log(`🔄 [LOOP] Processing value ${i + 1}/${effectiveLoopValues.length}: ${loopValue}`);

        // Create payload with the loop variable
        const loopPayload = {
          ...payload,
          [loopVarName]: loopValue,
        };

        try {
          // Execute the API call with the loop value
          const apiResponse = await this.executeApiCall(apiConfig, loopPayload, credentials, options);
          
          // Process the result
          const processedResult = await this.processStepResult(apiResponse);
          
          // Add to results array
          results.push({ raw: apiResponse, processed: processedResult });
        } catch (callError) {
          console.error(`❌ [LOOP] Error processing value '${loopValue}': ${String(callError)}`);
          // Continue with other values even if one fails
        }
      }

      if (results.length === 0) {
        console.error(`❌ [LOOP] All API calls failed for step ${this.step.id}`);
        this.storeStepResult(undefined, undefined, false, "All loop iterations failed");
        return false;
      }

      // Store all raw responses and processed results
      const rawResponses = results.map(r => r.raw);
      const processedResults = results.map(r => r.processed);
      
      // Store the results - we store the array of all results
      this.storeStepResult(rawResponses, processedResults, true);

      return true;
    } catch (error) {
      console.error(`❌ [LOOP] Error in step ${this.step.id}: ${String(error)}`);
      this.storeStepResult(undefined, undefined, false, String(error));
      return false;
    }
  }

  /**
   * Find the variable to loop over from the step configuration or analysis
   */
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
          isArray: true
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

  /**
   * Get values to loop over based on the variable mapping
   */
  private async getLoopValues(
    mapping: VariableMapping,
    loopVarName: string,
    payload: Record<string, unknown>,
  ): Promise<any[]> {
    if (mapping.selectedValues && mapping.selectedValues.length > 0) {
      return mapping.selectedValues;
    }

    // If source is payload, get values from there
    if (mapping.source === "payload") {
      const payloadValue = payload[loopVarName];
      if (Array.isArray(payloadValue)) {
        return payloadValue;
      }
      
      if (payloadValue !== undefined) {
        return [payloadValue];
      }
      return [];
    }

    // Get values from a previous step
    const sourceResult = this.result.stepResults[mapping.source]?.transformedData;
    if (!sourceResult) {
      console.log(`⚠️ [LOOP] No data found for source step ${mapping.source}`);
      return [];
    }

    // Find the source step to check configuration for extracting array values
    const sourceStep = this.executionPlan.steps.find(s => s.id === mapping.source);
    
    // Extract values using source step configuration
    if (sourceStep) {
      // 1. Check for arrayPath - a direct path to array values
      if (sourceStep.arrayPath && typeof sourceResult === 'object' && sourceResult !== null) {
        console.log(`🔄 [LOOP] Using arrayPath: ${sourceStep.arrayPath}`);
        
        // Split the path by dots and navigate to the specified location
        let currentValue: unknown = sourceResult;
        const pathParts = sourceStep.arrayPath.split('.');
        
        for (const part of pathParts) {
          if (currentValue && typeof currentValue === 'object' && part in (currentValue as Record<string, unknown>)) {
            currentValue = (currentValue as Record<string, unknown>)[part];
          } else {
            console.log(`⚠️ [LOOP] Path ${sourceStep.arrayPath} not found in result`);
            currentValue = undefined;
            break;
          }
        }
        
        if (Array.isArray(currentValue)) {
          console.log(`🔄 [LOOP] Found array at path ${sourceStep.arrayPath} with ${currentValue.length} elements`);
          return currentValue;
        }
        
        // Path led to an object, and objectKeysAsArray is true - return keys
        if (sourceStep.objectKeysAsArray && currentValue && typeof currentValue === 'object') {
          const keys = Object.keys(currentValue as Record<string, unknown>);
          console.log(`🔄 [LOOP] Using keys from ${sourceStep.arrayPath} as array values: ${keys.length} keys`);
          return keys;
        }
      }
      
      // 2. Check responseField - a field containing the main response data
      if (sourceStep.responseField && typeof sourceResult === 'object' && sourceResult !== null) {
        const fieldName = sourceStep.responseField;
        if (fieldName in (sourceResult as Record<string, unknown>)) {
          const fieldValue = (sourceResult as Record<string, unknown>)[fieldName];
          
          // If the field is an array, return it directly
          if (Array.isArray(fieldValue)) {
            console.log(`🔄 [LOOP] Using array from responseField ${fieldName} with ${fieldValue.length} elements`);
            return fieldValue;
          }
          
          // If the field is an object and objectKeysAsArray is true, return its keys
          if (sourceStep.objectKeysAsArray && fieldValue && typeof fieldValue === 'object') {
            const keys = Object.keys(fieldValue as Record<string, unknown>);
            console.log(`🔄 [LOOP] Using keys from responseField ${fieldName} as array values: ${keys.length} keys`);
            return keys;
          }
        }
      }
      
      // 3. If outputIsArray and objectKeysAsArray are both true, extract keys from the root object
      if (sourceStep.outputIsArray && sourceStep.objectKeysAsArray) {
        if (typeof sourceResult === 'object' && sourceResult !== null && !Array.isArray(sourceResult)) {
          const keys = Object.keys(sourceResult as Record<string, unknown>);
          console.log(`🔄 [LOOP] Using keys from root object as array values: ${keys.length} keys`);
          return keys;
        }
      }
    }

    // Extract values using data extractor with the mapping path
    const extractor = new DataExtractor(sourceResult as Record<string, unknown>);
    const values = extractor.extractValues(mapping.path);
    
    if (values.length > 0) {
      console.log(`🔄 [LOOP] Extracted ${values.length} values using mapping path ${mapping.path}`);
      return values;
    }

    // Last resort: If sourceResult is an array, return it directly
    if (Array.isArray(sourceResult)) {
      console.log(`🔄 [LOOP] Source result is already an array with ${sourceResult.length} elements`);
      return sourceResult;
    }

    console.log(`⚠️ [LOOP] No array values found for loop variable ${loopVarName}`);
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
      return new LoopExecutionStrategy(step, stepMapping, executionPlan, result, apiDocumentation, stepAnalysis, baseApiInput);
    }
    return new DirectExecutionStrategy(step, stepMapping, executionPlan, result, apiDocumentation, baseApiInput);
  }
}

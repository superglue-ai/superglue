import { Integration, Workflow } from "@superglue/client";
import { Metadata, toJsonSchema } from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMMessage } from "../llm/language-model.js";
import { executeTool } from "../execute/tools.js";
import { BUILD_WORKFLOW_SYSTEM_PROMPT } from "../llm/prompts.js";
import { logMessage } from "../utils/logs.js";
import { getWorkflowBuilderContext } from "../context/context-builders.js";

type ChatMessage = LLMMessage;

export class WorkflowBuilder {
  private integrations: Record<string, Integration>;
  private instruction: string;
  private initialPayload: Record<string, unknown>;
  private metadata: Metadata;
  private responseSchema: JSONSchema;
  private inputSchema: JSONSchema;

  constructor(
    instruction: string,
    integrations: Integration[],
    initialPayload: Record<string, unknown>,
    responseSchema: JSONSchema,
    metadata: Metadata
  ) {
    this.integrations = integrations.reduce((acc, int) => {
      acc[int.id] = int;
      return acc;
    }, {} as Record<string, Integration>);
    this.instruction = instruction;
    this.initialPayload = initialPayload || {};
    this.metadata = metadata;
    this.responseSchema = responseSchema;
    try {
      const credentials = Object.values(integrations).reduce((acc, int) => {
        return { ...acc, ...Object.entries(int.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${int.id}_${name}`]: value }), {}) };
      }, {});
      this.inputSchema = toJsonSchema(
        {
          payload: this.initialPayload,
          credentials: credentials
        },
        { arrays: { mode: 'all' }, }
      ) as unknown as JSONSchema;
    } catch (error) {
      logMessage('error', `Error during payload parsing: ${error}`, this.metadata);
      throw new Error(`Error during payload parsing: ${error}`);
    }
  }

  private prepareBuildingContext(): ChatMessage[] {
    const buildingPromptForAgent = getWorkflowBuilderContext({
      integrations: Object.values(this.integrations),
      payload: this.initialPayload,
      userInstruction: this.instruction,
      responseSchema: this.responseSchema
    }, {
      characterBudget: 100000,
      include: { integrationContext: true, availableVariablesContext: true, payloadContext: true, userInstruction: true }
    });
  
    return [
      { role: "system", content: BUILD_WORKFLOW_SYSTEM_PROMPT },
      { role: "user", content: buildingPromptForAgent }
    ];
  }

  private validateWorkflow(workflow: Workflow): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const availableIntegrationIds = Object.keys(this.integrations);
    const hasSteps = workflow.steps && workflow.steps.length > 0;
    const hasFinalTransform = workflow.finalTransform && workflow.finalTransform !== "$" && workflow.finalTransform !== "(sourceData) => sourceData";

    if (!hasSteps && !hasFinalTransform) {
      errors.push("Workflow must have either steps or a finalTransform to process data");
    }

    if (hasSteps && availableIntegrationIds.length === 0) {
      errors.push("Workflow has steps but no integrations are available. Either provide integrations or use a transform-only workflow.");
    }

    if (hasSteps) {
      workflow.steps?.forEach((step, index) => {
        if (!step.integrationId) {
          errors.push(`Step ${index + 1} (${step.id}): Missing integrationId`);
        } else if (!availableIntegrationIds.includes(step.integrationId)) {
          errors.push(`Step ${index + 1} (${step.id}): Invalid integrationId '${step.integrationId}'. Available integrations: ${availableIntegrationIds.join(', ')}`);
        }
        if (!step.apiConfig?.urlHost) {
          errors.push(`Step ${index + 1} (${step.id}): Missing URL configuration (urlHost: '${step.apiConfig?.urlHost || 'undefined'}'). Please ensure that all steps correspond to a single API call, or merge this step with the previous one.`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public async buildWorkflow(): Promise<Workflow> {
    let builtWorkflow: Workflow | null = null;
    let messages = this.prepareBuildingContext();
    let retryCount = 0;
    const maxRetries = 3;
    let lastError: string | null = null;

    while (retryCount < maxRetries) {
      try {
        logMessage('info', `Building workflow${retryCount > 0 ? ` (attempt ${retryCount + 1}/${maxRetries})` : ''}`, this.metadata);

        const toolMetadata = {
          ...this.metadata,
          messages
        };

        const result = await executeTool(
          {
            id: `build-workflow`,
            name: 'build_workflow',
            arguments: retryCount > 0 ? { previousError: lastError } : {}
          },
          toolMetadata
        );

        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.data || !(result.data?.id)) {
          throw new Error('No workflow generated');
        }

        builtWorkflow = result.data;

        const validation = this.validateWorkflow(builtWorkflow);
        if (!validation.valid) {
          const errorDetails = validation.errors.join('\n');
          const workflowSummary = JSON.stringify({
            id: builtWorkflow.id,
            steps: builtWorkflow.steps?.map(s => ({
              id: s.id,
              integrationId: s.integrationId,
              urlHost: s.apiConfig?.urlHost,
              urlPath: s.apiConfig?.urlPath
            }))
          }, null, 2);

          throw new Error(`Workflow validation failed:\n${errorDetails}\n\nGenerated workflow:\n${workflowSummary}`);
        }

        builtWorkflow.instruction = this.instruction;
        builtWorkflow.responseSchema = this.responseSchema;
        break;

      } catch (error: any) {
        lastError = error.message;
        logMessage('error', `Error during workflow build attempt ${retryCount + 1}: ${error.message}`, this.metadata);

        if (retryCount < maxRetries - 1) {
          messages.push({
            role: "user",
            content: `The previous workflow build attempt failed with the following error:\n\n${error.message}\n\nPlease fix these issues and generate a valid workflow.`
          } as ChatMessage);
        }

        retryCount++;
      }
    }

    if (!builtWorkflow) {
      const finalErrorMsg = `Workflow build failed after ${maxRetries} attempts. Last error: ${lastError}`;
      logMessage('error', finalErrorMsg, this.metadata);
      throw new Error(finalErrorMsg);
    }

    return {
      id: builtWorkflow.id,
      steps: builtWorkflow.steps,
      integrationIds: Object.keys(this.integrations),
      instruction: this.instruction,
      finalTransform: builtWorkflow.finalTransform,
      responseSchema: this.responseSchema,
      inputSchema: this.inputSchema,
      createdAt: builtWorkflow.createdAt || new Date(),
      updatedAt: builtWorkflow.updatedAt || new Date(),
    };
  }
}
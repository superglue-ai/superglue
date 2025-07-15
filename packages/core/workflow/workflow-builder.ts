import { ApiConfig, ExecutionStep, HttpMethod, Integration, Workflow } from "@superglue/client";
import { ExecutionMode, Metadata } from "@superglue/shared";
import { type OpenAI } from "openai";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { toJsonSchema } from "../external/json-schema.js";
import { LanguageModel } from "../llm/llm.js";
import { PLANNING_PROMPT } from "../llm/prompts.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js"; // Added import
import { composeUrl, safeHttpMethod } from "../utils/tools.js"; // Assuming path

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

interface WorkflowPlanStep {
  stepId: string;
  integrationId?: string;
  urlHost?: string;
  urlPath?: string;
  instruction: string;
  mode: ExecutionMode;
  loopSelector?: string;
  method?: HttpMethod;
}

interface WorkflowPlan {
  id: string;
  steps: WorkflowPlanStep[];
  finalTransform?: string;
}

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

  private async planWorkflow(
    currentMessages: ChatMessage[],
    lastErrorFromPreviousAttempt: string | null
  ): Promise<{ plan: WorkflowPlan; messages: ChatMessage[]; }> {

    const planSchema = zodToJsonSchema(z.object({
      id: z.string().describe("Come up with an ID for the workflow e.g. 'stripe-create-order'"),
      steps: z.array(z.object({
        stepId: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails', 'updateOrderStatus')."),
        integrationId: z.string().describe("The ID of the integration (from the provided list) to use for this step."),
        instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve (e.g., 'Get user profile by email', 'Create a new order')."),
        mode: z.enum(["DIRECT", "LOOP"]).describe("The mode of execution for this step. Use 'DIRECT' for simple calls executed once or 'LOOP' when the call needs to be executed multiple times over a collection (e.g. payload is a list of customer ids and call is executed for each customer id). Important: Pagination is NOT a reason to use LOOP since pagination is handled by the execution engine itself."),
        urlHost: z.string().optional().describe("Optional. Override the integration's default host. If not provided, the integration's urlHost will be used."),
        urlPath: z.string().optional().describe("Optional. Specific API path for this step. If not provided, the integration's urlPath might be used or the LLM needs to determine it from documentation if the integration's base URL is just a host."),
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().describe("Tentative HTTP method for this step, e.g. GET, POST, PUT, DELETE, PATCH. If unsure, default to GET.")
      })).describe("The sequence of steps required to fulfill the overall instruction.")
    }));


    const integrationDescriptions = Object.values(this.integrations).map(int => {
      const processedDoc = Documentation.postProcess(int.documentation || "", this.instruction);
      return `
  <${int.id}>
    Base URL: ${composeUrl(int.urlHost, int.urlPath)}
    Credentials available: ${JSON.stringify(Object.entries(int.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${int.id}_${name}`]: value }), {}) || 'None')}
    ${int.specificInstructions ? `\n    User Instructions for this integration:\n    ${int.specificInstructions}\n` : ''}
    Documentation:
    \`\`\`
    ${processedDoc || 'No documentation content available.'}
    \`\`\`
  </${int.id}>`;
    }).join("\n");
    const initialPayloadText = JSON.stringify(this.initialPayload);
    const initialPayloadDescription = this.initialPayload ? `Initial Input Payload contains keys: ${Object.keys(this.initialPayload).join(", ") || 'None'}\nPayload example: ${initialPayloadText.length > 10000 ? initialPayloadText.slice(0, 10000) + '...[truncated]' : initialPayloadText}` : '';

    let newMessages = [...currentMessages];

    if (newMessages.length === 0) {
      newMessages.push({ role: "system", content: PLANNING_PROMPT });
      const initialUserPrompt = `
Create a plan to fulfill the user's request by orchestrating single API calls across the available integrations.

<instruction>
${this.instruction}
</instruction>

<available_integrations>
${integrationDescriptions}
</available_integrations>

<initial_payload>
${initialPayloadDescription}
</initial_payload>

<output_schema>
Output a JSON object conforming to the WorkflowPlan schema. Define the necessary steps, assigning a unique lowercase \`stepId\`, selecting the appropriate \`integrationId\`, writing a clear \`instruction\` for that specific API call based on documentation, and setting the execution \`mode\`. 
For each step, also include a tentative HTTP \`method\` (GET, POST, etc.)—if unsure, default to GET. Assume data from previous steps is available implicitly for subsequent steps. If a step involves iteration, ensure \`loopSelector\` is appropriately defined. 
The plan should also include a \`finalTransform\` field, which is a JSONata expression for the final output transformation (default to '$' if no specific transformation is needed).
</output_schema>
`;
      newMessages.push({ role: "user", content: initialUserPrompt });
    }

    if (lastErrorFromPreviousAttempt) {
      newMessages.push({ role: "user", content: `The previous attempt resulted in an error: "${lastErrorFromPreviousAttempt}". Please analyze this error and provide a revised plan to address it. Ensure the new plan is valid and complete according to the schema.` });
    }

    const { response: rawPlanObject, messages: updatedMessagesFromLLM } = await LanguageModel.generateObject(
      newMessages,
      planSchema
    );

    if (!rawPlanObject || typeof rawPlanObject !== 'object' || !('steps' in rawPlanObject) || !Array.isArray(rawPlanObject.steps) || rawPlanObject.steps.length === 0) {
      const errorMsg = "Workflow planning failed: LLM did not produce a valid plan with steps.";
      logMessage('error', errorMsg + `\nPlan attempt: ${JSON.stringify(rawPlanObject)}`, this.metadata);
      throw new Error(errorMsg);
    }

    const plan: WorkflowPlan = {
      steps: rawPlanObject.steps as WorkflowPlanStep[],
      id: rawPlanObject.id,
      finalTransform: "(sourceData) => { return sourceData; }",
    };

    return { plan, messages: updatedMessagesFromLLM };
  }

  public async buildWithTools(): Promise<Workflow> {
    const { createToolExecutor, getToolDefinitions } = await import('../tools/tools.js');

    const MAX_BUILD_ATTEMPTS = 3;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
      logMessage('info',
        `Building workflow with tools${attempt > 1 ? ` (attempt ${attempt}/${MAX_BUILD_ATTEMPTS})` : ''}`,
        this.metadata
      );

      try {
        const toolMetadata = {
          ...this.metadata,
          integrations: Object.values(this.integrations),
          instruction: this.instruction
        };

        const toolExecutor = createToolExecutor(toolMetadata);

        const tools = getToolDefinitions(['search_documentation', 'plan_workflow', 'build_workflow']);

        const messages: ChatMessage[] = [
          {
            role: "system",
            content: `You are an expert workflow architect. Your task is to create a complete workflow by:
1. First searching documentation to understand API capabilities
2. Creating a detailed plan using plan_workflow
3. Building the complete workflow with build_workflow

The workflow should fulfill this instruction: ${this.instruction}

Available integrations: ${Object.keys(this.integrations).join(', ')}

Be thorough in your documentation searches. Look for:
- Authentication patterns
- Available endpoints
- Request/response formats
- Rate limits or special requirements

After planning, build a complete workflow with all necessary API configurations.`
          },
          {
            role: "user",
            content: `Create a workflow for: "${this.instruction}"
          
Initial payload structure: ${JSON.stringify(this.initialPayload, null, 2)}
Expected output schema: ${JSON.stringify(this.responseSchema, null, 2)}

Start by searching documentation for the integrations, then create a plan, and finally build the workflow.`
          }
        ];

        if (lastError && attempt > 1) {
          messages.push({
            role: "user",
            content: `The previous attempt failed with error: ${lastError}

Please try again, making sure to:
1. Search documentation more thoroughly for the specific requirements
2. Adjust the plan based on what you learned
3. Build a workflow that addresses the error`
          });
        }

        const result = await LanguageModel.executeTaskWithTools(
          messages,
          tools,
          toolExecutor,
          {
            maxIterations: 15,
            temperature: Math.min(0.2 + (attempt - 1) * 0.1, 0.5)
          }
        );

        let builtWorkflow = null;
        for (const step of result.executionTrace.reverse()) {
          if (step.toolCall.name === 'build_workflow' &&
            step.result.result?.success &&
            step.result.result?.workflow) {
            builtWorkflow = step.result.result.workflow;
            break;
          }
        }

        if (!builtWorkflow) {
          throw new Error("No successful build_workflow call found in execution trace");
        }

        logMessage('info',
          `Workflow built successfully using tools: ${builtWorkflow.id} with ${builtWorkflow.steps.length} steps`,
          this.metadata
        );

        return builtWorkflow;

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logMessage('warn',
          `Workflow build attempt ${attempt} failed: ${lastError}`,
          this.metadata
        );

        if (attempt === MAX_BUILD_ATTEMPTS) {
          throw new Error(`Failed to build workflow after ${MAX_BUILD_ATTEMPTS} attempts. Last error: ${lastError}`);
        }
      }
    }
    throw new Error(`Failed to build workflow: ${lastError}`);
  }

  public async build(): Promise<Workflow> {
    let success = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let lastErrorForPlanning: string | null = null;
    let builtWorkflow: Workflow | null = null;
    let conversationMessages: ChatMessage[] = [];
    do {
      attempts++;
      logMessage('info', `Building workflow${attempts > 1 ? ` (attempt ${attempts} of ${MAX_ATTEMPTS})` : ''}`, this.metadata);
      try {
        const { plan: currentPlan, messages: updatedConvMessages } = await this.planWorkflow(
          conversationMessages,
          lastErrorForPlanning
        );
        conversationMessages = updatedConvMessages;
        lastErrorForPlanning = null;

        const executionSteps: ExecutionStep[] = [];
        for (const plannedStep of currentPlan.steps) {
          const integration = this.integrations[plannedStep.integrationId];
          if (!integration) {
            const errorMsg = `Configuration error during step setup: integration ID "${plannedStep.integrationId}" for step "${plannedStep.stepId}" not found.`;
            logMessage('error', errorMsg, this.metadata);
            throw new Error(errorMsg);
          }
          const partialApiConfig: ApiConfig = {
            id: plannedStep.stepId,
            instruction: plannedStep.instruction,
            urlHost: plannedStep.urlHost || integration.urlHost,
            urlPath: plannedStep.urlPath || integration.urlPath,
            documentationUrl: integration.documentationUrl,
            method: safeHttpMethod(plannedStep.method)
          };
          const executionStep: ExecutionStep = {
            id: plannedStep.stepId,
            apiConfig: partialApiConfig,
            integrationId: plannedStep.integrationId,
            executionMode: plannedStep.mode,
            loopSelector: plannedStep.mode === "LOOP" ? "$" : undefined,
            inputMapping: "$",
            responseMapping: "$",
          };
          executionSteps.push(executionStep);
        }

        builtWorkflow = {
          id: currentPlan.id,
          steps: executionSteps,
          finalTransform: currentPlan.finalTransform || "(sourceData) => { return sourceData; }",
          responseSchema: this.responseSchema,
          instruction: this.instruction,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        success = true;
      } catch (error: any) {
        logMessage('error', `Error during workflow build attempt ${attempts}: ${error.message}`, this.metadata);
        lastErrorForPlanning = error.message || "An unexpected error occurred during the planning or setup phase.";
        success = false;
      }
    } while (!success && attempts < MAX_ATTEMPTS);

    if (!builtWorkflow) {
      const finalErrorMsg = `Failed to build and execute workflow after ${attempts} attempts. Last error: ${lastErrorForPlanning || "Unknown final error."}`;
      logMessage('error', finalErrorMsg, this.metadata);
      throw new Error(finalErrorMsg);
    }

    return {
      id: builtWorkflow.id,
      steps: builtWorkflow.steps,
      integrationIds: Object.keys(this.integrations),
      finalTransform: builtWorkflow.finalTransform,
      responseSchema: builtWorkflow.responseSchema,
      inputSchema: this.inputSchema,
      createdAt: builtWorkflow.createdAt,
      updatedAt: builtWorkflow.updatedAt,
    };
  }
}

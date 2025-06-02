import { ApiConfig, ExecutionStep, Workflow } from "@superglue/client";
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
import { composeUrl } from "../utils/tools.js"; // Assuming path

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

// Define the structure for system input
export interface SystemDefinition {
  id: string;
  urlHost: string;
  urlPath?: string;
  credentials: Record<string, any>;
  documentationUrl?: string;
  documentation?: string;
}

// Define the structure for the output of the planning step
interface WorkflowPlanStep {
  stepId: string;
  systemId: string;
  urlHost?: string;
  urlPath?: string;
  instruction: string;
  mode: ExecutionMode;
  loopSelector?: string;
}

interface WorkflowPlan {
  id: string;
  steps: WorkflowPlanStep[];
  finalTransform?: string;
}

export class WorkflowBuilder {
  private systems: Record<string, SystemDefinition>;
  private instruction: string;
  private initialPayload: Record<string, unknown>;
  private metadata: Metadata;
  private responseSchema: JSONSchema;
  private inputSchema: JSONSchema;

  constructor(
    systems: SystemDefinition[],
    instruction: string,
    initialPayload: Record<string, unknown>,
    responseSchema: JSONSchema,
    metadata: Metadata
  ) {
    this.systems = systems.reduce((acc, sys) => {
      acc[sys.id] = sys;
      return acc;
    }, {} as Record<string, SystemDefinition>);
    this.instruction = instruction;
    this.initialPayload = initialPayload;
    this.metadata = metadata;
    this.responseSchema = responseSchema;
    try {
      const credentials = Object.values(systems).reduce((acc, sys) => {
        return { ...acc, ...Object.entries(sys.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${sys.id}_${name}`]: value }), {}) };
      }, {});
      this.inputSchema = toJsonSchema(
        { payload: initialPayload, credentials: credentials },
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
  ): Promise<{ plan: WorkflowPlan; messages: ChatMessage[] }> {

    const planSchema = zodToJsonSchema(z.object({
      id: z.string().describe("Come up with an ID for the workflow e.g. 'stripe-create-order'"),
      steps: z.array(z.object({
        stepId: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails', 'updateOrderStatus')."),
        systemId: z.string().describe("The ID of the system (from the provided list) to use for this step."),
        instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve (e.g., 'Get user profile by email', 'Create a new order')."),
        mode: z.enum(["DIRECT", "LOOP"]).describe("The mode of execution for this step. Use 'DIRECT' for simple calls executed once or 'LOOP' when the call needs to be executed multiple times over a collection (e.g. payload is a list of customer ids and call is executed for each customer id)."),
        urlHost: z.string().optional().describe("Optional. Override the system's default host. If not provided, the system's urlHost will be used."),
        urlPath: z.string().optional().describe("Optional. Specific API path for this step. If not provided, the system's urlPath might be used or the LLM needs to determine it from documentation if the system's base URL is just a host.")
      })).describe("The sequence of steps required to fulfill the overall instruction.")
    }));

    const systemDescriptions = Object.values(this.systems).map(sys => `
--- System ID: ${sys.id} ---
Base URL: ${composeUrl(sys.urlHost, sys.urlPath)}
Credentials available: ${JSON.stringify(Object.entries(sys.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${sys.id}_${name}`]: value }), {}) || 'None')}
Documentation:
\`\`\`
${sys.documentation || 'No documentation content available.'}
\`\`\``
    ).join("\n");

    const initialPayloadDescription = `Initial Input Payload contains keys: ${Object.keys(this.initialPayload).join(", ") || 'None'}\nPayload example: ${JSON.stringify(this.initialPayload)}`;

    let newMessages = [...currentMessages];

    if (newMessages.length === 0) {
      newMessages.push({ role: "system", content: PLANNING_PROMPT });
      const initialUserPrompt = `
Create a plan to fulfill the user's request by orchestrating single API calls across the available systems.

Overall Instruction:
"${this.instruction}"

Available Systems and their API Documentation:
${systemDescriptions}

${initialPayloadDescription}

Output a JSON object conforming to the WorkflowPlan schema. Define the necessary steps, assigning a unique lowercase \`stepId\`, selecting the appropriate \`systemId\`, writing a clear \`instruction\` for that specific API call based on documentation, and setting the execution \`mode\`. Assume data from previous steps is available implicitly for subsequent steps. If a step involves iteration, ensure \`loopSelector\` is appropriately defined. The plan should also include a \`finalTransform\` field, which is a JSONata expression for the final output transformation (default to '$' if no specific transformation is needed).
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
      finalTransform: "$",
    };

    return { plan, messages: updatedMessagesFromLLM };
  }

  private async fetchDocumentation(): Promise<void> {
    for (const system of Object.values(this.systems)) {
      if (system.documentation) {
        continue;
      }
      const documentation = new Documentation({
        urlHost: system.urlHost,
        urlPath: system.urlPath,
        documentationUrl: system.documentationUrl
      }, this.metadata);
      system.documentation = await documentation.fetch(this.instruction);
    }
  }


  public async build(): Promise<Workflow> {
    await this.fetchDocumentation();
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
          const system = this.systems[plannedStep.systemId];
          if (!system) {
            const errorMsg = `Configuration error during step setup: System ID "${plannedStep.systemId}" for step "${plannedStep.stepId}" not found.`;
            logMessage('error', errorMsg, this.metadata);
            throw new Error(errorMsg);
          }
          const partialApiConfig: ApiConfig = {
            id: plannedStep.stepId,
            instruction: plannedStep.instruction,
            urlHost: plannedStep.urlHost || system.urlHost,
            urlPath: plannedStep.urlPath || system.urlPath,
            documentationUrl: system.documentationUrl,
          };
          const executionStep: ExecutionStep = {
            id: plannedStep.stepId,
            apiConfig: partialApiConfig,
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
          finalTransform: currentPlan.finalTransform || "$",
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
      finalTransform: builtWorkflow.finalTransform,
      responseSchema: builtWorkflow.responseSchema,
      inputSchema: this.inputSchema,
      createdAt: builtWorkflow.createdAt,
      updatedAt: builtWorkflow.updatedAt,
    };
  }
}

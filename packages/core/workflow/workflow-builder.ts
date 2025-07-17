import { Integration, Workflow } from "@superglue/client";
import { ExecutionMode, Metadata } from "@superglue/shared";
import { type OpenAI } from "openai";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { toJsonSchema } from "../external/json-schema.js";
import { PLAN_WORKFLOW_SYSTEM_PROMPT } from "../llm/prompts.js";
import { createToolExecutor } from "../tools/tools.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js"; // Added import
import { composeUrl } from "../utils/tools.js"; // Assuming path

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

interface WorkflowPlanStep {
  stepId: string;
  integrationId?: string;
  instruction: string;
  mode: ExecutionMode;
  loopSelector?: string;
}

interface WorkflowPlan {
  id: string;
  steps: WorkflowPlanStep[];
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

  private generateIntegrationDescriptions(includeFullDocs: boolean = true): string {
    return Object.values(this.integrations).map(int => {
      const baseInfo = `
<${int.id}>
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}
  Credentials available: ${Object.keys(int.credentials || {}).map(k => `${int.id}_${k}`).join(', ') || 'None'}
  ${int.specificInstructions ? `\n  User Instructions for this integration:\n  ${int.specificInstructions}\n` : ''}`;

      if (includeFullDocs) {
        const processedDoc = Documentation.postProcess(int.documentation || "", this.instruction);
        return baseInfo + `
  Documentation:
  \`\`\`
  ${processedDoc || 'No documentation content available.'}
  \`\`\`
</${int.id}>`;
      } else {
        return baseInfo + `\n</${int.id}>`;
      }
    }).join("\n");
  }

  private generatePayloadDescription(maxLength: number = 10000): string {
    if (!this.initialPayload || Object.keys(this.initialPayload).length === 0) {
      return 'No initial payload provided';
    }

    const payloadText = JSON.stringify(this.initialPayload);
    const truncatedPayload = payloadText.length > maxLength ?
      payloadText.slice(0, maxLength) + '...[truncated]' :
      payloadText;

    return `Initial Input Payload contains keys: ${Object.keys(this.initialPayload).join(", ")}\nPayload example: ${truncatedPayload}`;
  }

  private async planWorkflow(
    currentMessages: ChatMessage[],
    lastErrorFromPreviousAttempt: string | null
  ): Promise<{ plan: WorkflowPlan; messages: ChatMessage[]; }> {

    const integrationDescriptions = this.generateIntegrationDescriptions(true);
    const initialPayloadDescription = this.generatePayloadDescription();

    let newMessages = [...currentMessages];

    if (newMessages.length === 0) {
      newMessages.push({ role: "system", content: PLAN_WORKFLOW_SYSTEM_PROMPT });
      const planningPromptForAgent = `
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
Output a JSON object with a workflow plan that breaks down the instruction into manageable steps. 
Each step should represent a single API call with:
- A unique \`stepId\` in camelCase (e.g., 'fetchCustomerDetails', 'updateOrderStatus')
- The \`integrationId\` to use for that step (must be one of: ${Object.keys(this.integrations).join(', ')})
- A clear \`instruction\` describing what the API call should achieve that respects the user instruction and the integration's specific instructions
- The execution \`mode\` (DIRECT for single execution, LOOP for iterating over collections)
</output_schema>
`;
      newMessages.push({ role: "user", content: planningPromptForAgent });
    }

    if (lastErrorFromPreviousAttempt) {
      newMessages.push({ role: "user", content: `The previous attempt resulted in an error: "${lastErrorFromPreviousAttempt}". Please analyze this error and provide a revised plan to address it. Ensure the new plan is valid and complete according to the schema.` });
    }

    const toolExecutor = createToolExecutor(this.metadata);

    const toolCall = {
      id: `plan-${Date.now()}`,
      name: 'plan_workflow',
      arguments: {
        messages: newMessages,
        integrationIds: Object.keys(this.integrations)
      }
    };

    const result = await toolExecutor(toolCall);

    if (!result.result?.success || !result.result?.plan) {
      const errorMsg = result.result?.error || "Workflow planning failed: Tool did not produce a valid plan.";
      logMessage('error', errorMsg + `\nPlan attempt: ${JSON.stringify(result)}`, this.metadata);
      throw new Error(errorMsg);
    }

    const plan: WorkflowPlan = result.result.plan;

    return { plan, messages: newMessages };
  }

  public async buildWorkflow(): Promise<Workflow> {
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
        const { plan: currentPlan, messages: planMessages } = await this.planWorkflow(
          conversationMessages,
          lastErrorForPlanning
        );
        conversationMessages = planMessages;
        lastErrorForPlanning = null;

        // Create fresh message history for building phase
        const buildMessages: ChatMessage[] = [];

        // Add building-specific user message with integration descriptions
        const integrationDescriptions = this.generateIntegrationDescriptions(false); // No full docs needed for building
        const initialPayloadDescription = this.generatePayloadDescription(1000); // Shorter for building phase

        const availableVariables = [
          ...Object.values(this.integrations).flatMap(int => Object.keys(int.credentials || {}).map(k => `<<${int.id}_${k}>>`)),
          ...Object.keys(this.initialPayload || {}).map(k => `<<${k}>>`),
          '<<page>>', '<<pageSize>>', '<<offset>>', '<<cursor>>', '<<limit>>'
        ].join(", ");

        const buildingPromptForAgent = `
Build a complete workflow configuration from the following plan.

<instruction>
${this.instruction}
</instruction>

<workflow_plan>
${JSON.stringify(currentPlan, null, 2)}
</workflow_plan>

<available_integrations>
${integrationDescriptions}
</available_integrations>

<available_variables>
${availableVariables}
</available_variables>

<initial_payload>
${initialPayloadDescription}
</initial_payload>

<output_schema>
Generate a complete workflow object with:
- All API configurations for each step (URL, method, headers, body, authentication)
- Input and response mappings as JavaScript functions
- Loop selectors for LOOP mode steps
- A final transform function to shape the output
- All fields required for execution
</output_schema>`;

        buildMessages.push({ role: "user", content: buildingPromptForAgent });

        const toolExecutor = createToolExecutor({
          ...this.metadata,
          integrations: Object.values(this.integrations)
        });

        const toolCall = {
          id: `build-${Date.now()}`,
          name: 'build_workflow',
          arguments: {
            messages: buildMessages,
            plan: currentPlan,
            instruction: this.instruction,
          }
        };

        const result = await toolExecutor(toolCall);

        const generatedWorkflow = result.result.workflow;

        if (generatedWorkflow && generatedWorkflow.steps) {
            generatedWorkflow.steps.forEach((step: any) => {
                if (step.apiConfig) {
                    step.apiConfig.id = step.id;
                    step.apiConfig.createdAt = new Date();
                    step.apiConfig.updatedAt = new Date();
                }
                // Set default responseMapping for backward compatibility
                step.responseMapping = "$";
            });
        }
        
        builtWorkflow = generatedWorkflow;
        success = true;
      } catch (error: any) {
        logMessage('error', `Error during workflow build attempt ${attempts}: ${error.message}`, this.metadata);
        lastErrorForPlanning = error.message || "An unexpected error occurred during the building phase.";
        success = false;
      }
    } while (!success && attempts < MAX_ATTEMPTS);

    if (!builtWorkflow) {
      const finalErrorMsg = `Failed to build workflow after ${attempts} attempts. Last error: ${lastErrorForPlanning || "Unknown final error."}`;
      logMessage('error', finalErrorMsg, this.metadata);
      throw new Error(finalErrorMsg);
    }

    return {
      id: builtWorkflow.id,
      steps: builtWorkflow.steps,
      integrationIds: builtWorkflow.integrationIds || Object.keys(this.integrations),
      finalTransform: builtWorkflow.finalTransform,
      responseSchema: this.responseSchema,
      inputSchema: this.inputSchema,
      createdAt: builtWorkflow.createdAt || new Date(),
      updatedAt: builtWorkflow.updatedAt || new Date(),
    };
  }
}

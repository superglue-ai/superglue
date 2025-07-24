import { Integration, Workflow } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { type OpenAI } from "openai";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { toJsonSchema } from "../external/json-schema.js";
import { BUILD_WORKFLOW_SYSTEM_PROMPT } from "../llm/prompts.js";
import { executeTool } from "../tools/tools.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";
import { composeUrl } from "../utils/tools.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

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

  private generateIntegrationDescriptions(): string {
    return Object.values(this.integrations).map(int => {
      const baseInfo = `
<${int.id}>
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}
  Credentials available: ${Object.keys(int.credentials || {}).map(k => `${int.id}_${k}`).join(', ') || 'None'}
  ${int.specificInstructions ? `\n  User Instructions for this integration:\n  ${int.specificInstructions}\n` : ''}`;

      const processedDoc = Documentation.postProcess(int.documentation || "", this.instruction);
      return baseInfo + `
  <documentation>
  \`\`\`
  ${processedDoc || 'No documentation content available.'}
  \`\`\`
  </documentation>
</${int.id}>`;
    }).join("\n");
  }

  private generatePayloadDescription(maxLength: number = 1000): string {
    if (!this.initialPayload || Object.keys(this.initialPayload).length === 0) {
      return 'No initial payload provided';
    }

    const payloadText = JSON.stringify(this.initialPayload);
    const truncatedPayload = payloadText.length > maxLength ?
      payloadText.slice(0, maxLength) + '...[truncated]' :
      payloadText;

    return `Initial Input Payload contains keys: ${Object.keys(this.initialPayload).join(", ")}\nPayload example: ${truncatedPayload}`;
  }

  private prepareBuildingContext(): ChatMessage[] {
    const integrationDescriptions = this.generateIntegrationDescriptions();
    const initialPayloadDescription = this.generatePayloadDescription();

    const availableVariables = [
      ...Object.values(this.integrations).flatMap(int => Object.keys(int.credentials || {}).map(k => `<<${int.id}_${k}>>`)),
      ...Object.keys(this.initialPayload || {}).map(k => `<<${k}>>`)
    ].join(", ");

    const buildingPromptForAgent = `
Build a complete workflow to fulfill the user's request.

<instruction>
${this.instruction}
</instruction>

<available_integrations>
${integrationDescriptions}
</available_integrations>

<available_variables>
Template variables (use in URLs, headers, body with <<variable>> syntax):
${availableVariables}

For pagination (when enabled):
- <<page>> - current page number
- <<offset>> - current offset
- <<limit>> - page size
- <<cursor>> - pagination cursor
</available_variables>

<initial_payload>
${initialPayloadDescription}
</initial_payload>

${this.responseSchema && Object.keys(this.responseSchema).length > 0 ? `<expected_output_schema>
The final workflow output must match this JSON schema:
${JSON.stringify(this.responseSchema, null, 2)}

Your finalTransform function MUST transform the collected data from all steps to match this exact schema.
</expected_output_schema>` : ''}

<output_schema>
Generate a complete workflow object with:
- A workflow ID (e.g., 'stripe-create-order')
- Steps that break down the instruction into manageable API calls
- All API configurations for each step (URL, method, headers, body, authentication)
- Input and response mappings as JavaScript functions
- Loop selectors for LOOP mode steps
- A final transform function to shape the output${this.responseSchema && Object.keys(this.responseSchema).length > 0 ? ' to match the expected_output_schema' : ''}
- All fields required for execution

Remember:
- Each step must be a single API call
- Loop selectors extract arrays of ACTUAL DATA ITEMS to process
- Input mappings prepare data for each API call
- Use defensive programming in all JavaScript functions
- Handle missing data gracefully with defaults
${this.responseSchema && Object.keys(this.responseSchema).length > 0 ? '- The finalTransform MUST produce output that validates against the expected_output_schema' : ''}
</output_schema>`;

    return [
      { role: "system", content: BUILD_WORKFLOW_SYSTEM_PROMPT },
      { role: "user", content: buildingPromptForAgent }
    ];
  }

  public async buildWorkflow(): Promise<Workflow> {
    let success = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let lastError: string | null = null;
    let builtWorkflow: Workflow | null = null;

    do {
      attempts++;

      try {
        logMessage('info', `Building workflow (attempt ${attempts})`, this.metadata);

        const messages = this.prepareBuildingContext();

        const toolMetadata = {
          ...this.metadata,
          messages
        };

        // Call the build_workflow tool
        const result = await executeTool(
          {
            id: `build-workflow-${attempts}`,
            name: 'build_workflow',
            arguments: {
              previousError: lastError
            }
          },
          toolMetadata
        );

        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.result?.fullResult?.workflow) {
          throw new Error('No workflow generated');
        }

        builtWorkflow = result.result.fullResult.workflow;

        builtWorkflow.instruction = this.instruction;
        builtWorkflow.responseSchema = this.responseSchema;

        success = true;

      } catch (error: any) {
        logMessage('error', `Error during workflow build attempt ${attempts}: ${error.message}`, this.metadata);
        lastError = error.message || "An unexpected error occurred during the building phase.";
        success = false;
      }
    } while (!success && attempts < MAX_ATTEMPTS);

    if (!builtWorkflow) {
      const finalErrorMsg = `Failed to build workflow after ${attempts} attempts. Last error: ${lastError || "Unknown final error."}`;
      logMessage('error', finalErrorMsg, this.metadata);
      throw new Error(finalErrorMsg);
    }

    return {
      id: builtWorkflow.id,
      steps: builtWorkflow.steps,
      integrationIds: Object.keys(this.integrations),
      finalTransform: builtWorkflow.finalTransform,
      responseSchema: this.responseSchema,
      inputSchema: this.inputSchema,
      createdAt: builtWorkflow.createdAt || new Date(),
      updatedAt: builtWorkflow.updatedAt || new Date(),
    };
  }
}

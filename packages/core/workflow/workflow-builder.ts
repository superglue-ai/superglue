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
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}`

      if (!int.documentation) {
        return baseInfo + `
  <documentation>
  No documentation content available.
  </documentation>
</${int.id}>`;
      }
      const authSection = Documentation.extractRelevantSections(
        int.documentation,
        "authentication authorization api key token bearer basic oauth credentials access private app secret",
        5,  // max 5 sections
        400 // smaller sections for targeted info
      );

      const paginationSection = Documentation.extractRelevantSections(
        int.documentation,
        "pagination page offset cursor limit per_page pageSize after next previous paging paginated results list",
        5,  // max 5 sections
        400 // smaller sections for targeted info
      );
      const generalSection = Documentation.extractRelevantSections(
        int.documentation,
        this.instruction || "api endpoints methods",
        10,  // max 10 sections
        1000 // larger sections for context
      );

      return baseInfo + `
  <documentation>
    <authentication>
    ${authSection || 'No authentication information found.'}
    </authentication>
    
    <pagination>
    ${paginationSection || 'No pagination information found.'}
    </pagination>
    
    <general_context>
    ${generalSection || 'No general documentation found.'}
    </general_context>
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

<user_instruction>
${this.instruction}
</user_instruction>

<available_integrations_and_documentation>
${integrationDescriptions}
</available_integrations_and_documentation>

<available_variables>
Initial payload and credentials (use in URLs, headers, body with <<variable>> syntax):
${availableVariables}
</available_variables>

<initial_payload>
${initialPayloadDescription}
</initial_payload>

${this.responseSchema && Object.keys(this.responseSchema).length > 0 ? `<expected_output_schema>
The final workflow output must match this JSON schema:
${JSON.stringify(this.responseSchema, null, 2)}
Your finalTransform function MUST transform the collected data from all steps to match this exact schema.
</expected_output_schema>` : 'No expected output schema provided, ensure that the final output matches the instruction.'}`;

    return [
      { role: "system", content: BUILD_WORKFLOW_SYSTEM_PROMPT },
      { role: "user", content: buildingPromptForAgent }
    ];
  }

  public async buildWorkflow(): Promise<Workflow> {
    let builtWorkflow: Workflow | null = null;

    try {
      logMessage('info', `Building workflow`, this.metadata);

      const messages = this.prepareBuildingContext();

      const toolMetadata = {
        ...this.metadata,
        messages
      };

      // Call the build_workflow tool
      const result = await executeTool(
        {
          id: `build-workflow`,
          name: 'build_workflow',
          arguments: {}
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

    } catch (error: any) {
      logMessage('error', `Error during workflow build attempt: ${error.message}`, this.metadata);
    }

    if (!builtWorkflow) {
      const finalErrorMsg = `The build_workflow tool call failed to build a valid workflow.`;
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

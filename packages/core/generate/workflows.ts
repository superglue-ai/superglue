import { Integration, Workflow } from "@superglue/client";
import { Metadata, toJsonSchema } from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { getObjectContext } from "../context/context-builders.js";
import { BUILD_WORKFLOW_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { LLMMessage } from "../llm/language-model.js";
import { logMessage } from "../utils/logs.js";
import { composeUrl } from "../utils/tools.js";
import { executeTool } from "./tools.js";

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

  private generateIntegrationDescriptions(maxChars: number = 100000): string {
    const documentationSearch = new DocumentationSearch(this.metadata);
    const descriptions = Object.values(this.integrations).map(int => {
      if (!int.documentation) {
        return `<${int.id}>
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}
  <specific_instructions>
  ${int.specificInstructions?.length > 0 ? int.specificInstructions : "No specific instructions provided."}
  </specific_instructions>
</${int.id}>`;
      }
      const authSection = documentationSearch.extractRelevantSections(
        int.documentation,
        "authentication authorization api key token bearer basic oauth credentials access private app secret",
        3,  // fewer sections needed for auth
        2000, // should be detailed though
        int.openApiSchema
      );

      const paginationSection = documentationSearch.extractRelevantSections(
        int.documentation,
        "pagination page offset cursor limit per_page pageSize after next previous paging paginated results list",
        3,  // max 3 sections
        2000, // same logic applies here
        int.openApiSchema
      );
      const generalSection = documentationSearch.extractRelevantSections(
        int.documentation,
        this.instruction + "reference object endpoints methods properties values fields enums search query filter list create update delete get put post patch",
        20,  // max 20 sections
        1000, // should cover examples, endpoints etc.
        int.openApiSchema
      );

      return `<${int.id}>
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}
  <specific_instructions>
  ${int.specificInstructions?.length > 0 ? int.specificInstructions : "No specific instructions provided."}
  </specific_instructions>
  <documentation>
${authSection ? `<authentication>
${authSection}
</authentication>` : ''}
    
    ${paginationSection && paginationSection != authSection ? `<pagination>
    ${paginationSection}
    </pagination>` : ''}
    
    <context_relevant_to_user_instruction>
    ${generalSection && generalSection != authSection && generalSection != paginationSection ? generalSection : 'No general documentation found.'}
    </context_relevant_to_user_instruction>
  </documentation>
</${int.id}>`;
    }).join("\n");

    if (descriptions.length > maxChars) {
      return descriptions.slice(0, maxChars) + "\n... [integrations documentation truncated]";
    }
    return descriptions;
  }

  private generatePayloadDescription(maxChars: number = 100000): string {
    if (!this.initialPayload || Object.keys(this.initialPayload).length === 0) {
      return 'No initial payload provided';
    }
    const payloadContext = getObjectContext(this.initialPayload, { include: { schema: true, preview: false, samples: true }, characterBudget: maxChars });
    return payloadContext;
  }

  private generateCredentialsDescription(): string {
    return Object.entries(this.integrations)
      .map(([integrationId, integration]) => {
        const credentials = Object.keys(integration.credentials || {})
          .map(cred => `context.credentials.${cred}`)
          .join(", ");
        return `${integrationId}:\n${credentials || "No credentials"}`;
      })
      .join("\n\n");
  }

  private prepareBuildingContext(): ChatMessage[] {
    const integrationDescriptions = this.generateIntegrationDescriptions();
    const initialPayloadDescription = this.generatePayloadDescription();
    const credentialsDescription = this.generateCredentialsDescription();
    const hasIntegrations = Object.keys(this.integrations).length > 0;

    const buildingPromptForAgent = `
Build a complete workflow to fulfill the user's request.

<user_instruction>
${this.instruction}
</user_instruction>

${hasIntegrations ? `<available_integrations_and_documentation>
${integrationDescriptions}
</available_integrations_and_documentation>` : '<no_integrations_available>No integrations provided. Build a transform-only workflow using finalTransform to process the payload data.</no_integrations_available>'}

<available_credentials>
${credentialsDescription}
</available_credentials>

<available_input_data_fields>
${initialPayloadDescription}
</available_input_data_fields>

${hasIntegrations
        ? 'Ensure that the final output matches the instruction and you use ONLY the available integration ids.'
        : 'Since no integrations are available, create a transform-only workflow with no steps, using only the finalTransform to process the payload data.'}`;

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
        const hasApiConfig = !!(step as any).apiConfig;
        const hasCodeConfig = !!(step as any).codeConfig;
        
        if (!hasApiConfig && !hasCodeConfig) {
          errors.push(`Step ${index + 1} (${step.id}): Missing configuration. Each step must have either apiConfig (legacy) or codeConfig.`);
        }
        if (hasApiConfig && hasCodeConfig) {
          errors.push(`Step ${index + 1} (${step.id}): Invalid configuration. Step cannot have both apiConfig and codeConfig.`);
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
              hasApiConfig: !!(s as any).apiConfig,
              hasCodeConfig: !!(s as any).codeConfig,
              codeConfigInstruction: (s as any).codeConfig?.stepInstruction
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
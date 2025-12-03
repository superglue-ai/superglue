import { convertRequiredToArray, HttpMethod, Integration, ServiceMetadata, toJsonSchema, Tool } from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getToolBuilderContext } from "../context/context-builders.js";
import { BUILD_TOOL_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { LanguageModel, LLMMessage } from "../llm/llm-base-model.js";
import { getWebSearchTool } from "../llm/llm-tools.js";
import { logMessage } from "../utils/logs.js";

export class ToolBuilder {
  private integrations: Record<string, Integration>;
  private instruction: string;
  private initialPayload: Record<string, unknown>;
  private metadata: ServiceMetadata;
  private responseSchema: JSONSchema;
  private inputSchema: JSONSchema;
  private toolSchema: any;

  constructor(
    instruction: string,
    integrations: Integration[],
    initialPayload: Record<string, unknown>,
    responseSchema: JSONSchema,
    metadata: ServiceMetadata
  ) {
    this.integrations = integrations.reduce((acc, int) => {
      acc[int.id] = int;
      return acc;
    }, {} as Record<string, Integration>);
    this.instruction = instruction;
    this.initialPayload = initialPayload || {};
    this.metadata = metadata;
    this.responseSchema = responseSchema;
    this.toolSchema = zodToJsonSchema(toolSchema);
    try {
      const credentials = Object.values(integrations).reduce((acc, int) => {
        return { ...acc, ...Object.entries(int.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${int.id}_${name}`]: value }), {}) };
      }, {});
      const rawSchema = toJsonSchema(
        {
          payload: this.initialPayload,
          credentials: credentials
        },
        { arrays: { mode: 'all' }, required: true, requiredDepth: 2 }
      );
      this.inputSchema = convertRequiredToArray(rawSchema) as JSONSchema;
    } catch (error) {
      logMessage('error', `Error during payload parsing: ${error}`, this.metadata);
      throw new Error(`Error during payload parsing: ${error}`);
    }
  }

  private prepareBuildingContext(): LLMMessage[] {
    const buildingPromptForAgent = getToolBuilderContext({
      integrations: Object.values(this.integrations),
      payload: this.initialPayload,
      userInstruction: this.instruction,
      responseSchema: this.responseSchema
    }, {
      characterBudget: 120000,
      include: { integrationContext: true, availableVariablesContext: true, payloadContext: true, userInstruction: true }
    });

    return [
      { role: "system", content: BUILD_TOOL_SYSTEM_PROMPT },
      { role: "user", content: buildingPromptForAgent }
    ];
  }

  private validateTool(tool: Tool): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const availableIntegrationIds = Object.keys(this.integrations);
    const hasSteps = tool.steps && tool.steps.length > 0;
    const hasFinalTransform = tool.finalTransform && tool.finalTransform !== "$" && tool.finalTransform !== "(sourceData) => sourceData";

    if (!hasSteps && !hasFinalTransform) {
      errors.push("Tool must have either steps or a finalTransform to process data");
    }

    if (hasSteps && availableIntegrationIds.length === 0) {
      errors.push("Tool has steps but no integrations are available. Either provide integrations or use a transform-only tool.");
    }

    if (hasSteps) {
      tool.steps?.forEach((step, index) => {
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

    if(!hasSteps && Object.keys(this.initialPayload).length === 0) {
      errors.push("Tool is missing steps and initial payload. You probably need to add steps.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public async buildTool(): Promise<Tool> {
    const maxRetries = 3;
    let messages = this.prepareBuildingContext();
    let lastError: string | null = null;

    const webSearchTool = getWebSearchTool();
    const tools = webSearchTool 
      ? [{ toolDefinition: { web_search: webSearchTool }, toolContext: {} }]
      : [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logMessage('info', `Building tool${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries})` : ''}`, this.metadata);

        if (attempt > 0 && lastError) {
          messages.push({
            role: "user",
            content: `The previous attempt failed with: "${lastError}". Please fix this issue in your new attempt.`
          } as LLMMessage);
        }

        const generateToolResult = await LanguageModel.generateObject<Tool>({
          messages,
          schema: this.toolSchema,
          temperature: 0.0,
          tools,
          metadata: this.metadata
        });

        messages = generateToolResult.messages;

        if (!generateToolResult.success) {
          throw new Error(`Error generating tool: ${generateToolResult.response}`);
        }

        const generatedTool = generateToolResult.response;

        if (!Array.isArray(generatedTool.steps)) {
          throw new Error(`LLM returned invalid tool structure: steps must be an array, got ${typeof generatedTool.steps}: ${typeof generatedTool.steps === 'object' ? JSON.stringify(generatedTool.steps, null, 2) : generatedTool.steps}`);
        }

        generatedTool.steps = generatedTool.steps.map(step => ({
          ...step,
          modify: step.modify || false,
          apiConfig: {
            ...step.apiConfig,
            queryParams: step.apiConfig.queryParams
              ? Object.fromEntries(step.apiConfig.queryParams.map((p: any) => [p.key, p.value]))
              : undefined,
            headers: step.apiConfig.headers
              ? Object.fromEntries(step.apiConfig.headers.map((h: any) => [h.key, h.value]))
              : undefined,
          }
        }));

        const validation = this.validateTool(generatedTool);
        if (!validation.valid) {
          const errorDetails = validation.errors.join('\n');
          const toolSummary = JSON.stringify({
            id: generatedTool.id,
            steps: generatedTool.steps?.map(s => ({
              id: s.id,
              integrationId: s.integrationId,
              urlHost: s.apiConfig?.urlHost,
              urlPath: s.apiConfig?.urlPath
            }))
          }, null, 2);

          throw new Error(`Tool validation failed:\n${errorDetails}\n\nGenerated tool:\n${toolSummary}`);
        }

        generatedTool.instruction = this.instruction;
        generatedTool.responseSchema = this.responseSchema;

        return {
          id: generatedTool.id,
          steps: generatedTool.steps,
          integrationIds: Object.keys(this.integrations),
          instruction: this.instruction,
          finalTransform: generatedTool.finalTransform,
          responseSchema: this.responseSchema,
          inputSchema: this.inputSchema,
          createdAt: generatedTool.createdAt || new Date(),
          updatedAt: generatedTool.updatedAt || new Date(),
        };

      } catch (error: any) {
        lastError = error.message;
        logMessage('error', `Error during tool build attempt ${attempt + 1}: ${error.message}`, this.metadata);
      }
    }

    const finalErrorMsg = `Tool build failed after ${maxRetries} attempts. Last error: ${lastError}`;
    logMessage('error', finalErrorMsg, this.metadata);
    throw new Error(finalErrorMsg);
  }
}

const toolSchema = z.object({
  id: z.string().describe("The tool ID (e.g., 'stripe-create-order')"),
  steps: z.array(z.object({
      id: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails')"),
      integrationId: z.string().describe("REQUIRED: The integration ID for this step (must match one of the available integration IDs)"),
      loopSelector: z.string().describe("JavaScript function that returns OBJECT for direct execution or ARRAY for loop execution. If returns OBJECT (including {}), step executes once with object as currentItem. If returns ARRAY, step executes once per array item. Examples: (sourceData) => ({ userId: sourceData.userId }) OR (sourceData) => sourceData.getContacts.data.filter(c => c.active)"),
      modify: z.boolean().optional().describe("Marks whether this operation modifies data on the system it operates on (writes, updates, deletes). Read-only operations should be false. Default is false."),
      apiConfig: z.object({
          id: z.string().describe("Same as the step ID"),
          instruction: z.string().describe("A concise instruction describing WHAT data this API call should retrieve or what action it should perform."),
          urlHost: z.string().describe("The base URL host (e.g., https://api.example.com). Must not be empty."),
          urlPath: z.string().describe("The API endpoint path (e.g., /v1/users)."),
          method: z.enum(Object.values(HttpMethod) as [string, ...string[]]).describe("HTTP method (MUST be a literal value, not a variable or expression): GET, POST, PUT, DELETE, or PATCH"),
          queryParams: z.array(z.object({
              key: z.string(),
              value: z.string()
          })).optional().describe("Query parameters as key-value pairs. If pagination is configured, ensure you have included the right pagination parameters here or in the body."),
          headers: z.array(z.object({
              key: z.string(),
              value: z.string()
          })).optional().describe("HTTP headers as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions"),
          body: z.string().optional().describe("Request body. Use <<variable>> syntax for dynamic values. If pagination is configured, ensure you have included the right pagination parameters here or in the queryParams."),
          pagination: z.object({
              type: z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED"]),
              pageSize: z.string().describe("Number of items per page (e.g., '50', '100'). Once set, this becomes available as <<limit>> (same as pageSize)."),
              cursorPath: z.string().describe("If cursor_based: The JSONPath to the cursor in the response. If not, set this to \"\""),
              stopCondition: z.string().describe("REQUIRED: JavaScript function that determines when to stop pagination. This is the primary control for pagination. Format: (response, pageInfo) => boolean. The pageInfo object contains: page (number), offset (number), cursor (any), totalFetched (number). response is the axios response object, access response data via response.data. Return true to STOP. E.g. (response, pageInfo) => !response.data.pagination.has_more")
          }).optional().describe("OPTIONAL: Only configure if you are using pagination variables in the URL, headers, or body. For OFFSET_BASED, ALWAYS use <<offset>>. If PAGE_BASED, ALWAYS use <<page>>. If CURSOR_BASED, ALWAYS use <<cursor>>.")
      }).describe("Complete API configuration for this step")
  })).describe("Array of workflow steps. Can be empty ([]) for transform-only workflows that just process the input payload without API calls"),
  finalTransform: z.string().describe("JavaScript function to transform the final workflow output to match responseSchema. Check if result is object or array: if object use sourceData.stepId.data, if array use sourceData.stepId.map(item => item.data). Example: (sourceData) => {return { result: Array.isArray(sourceData.stepId) ? sourceData.stepId.map(item => item.data) : sourceData.stepId.data }}"),
});
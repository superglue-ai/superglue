import {
  convertRequiredToArray,
  HttpMethod,
  System,
  ServiceMetadata,
  toJsonSchema,
  Tool,
  RequestStepConfig,
  isRequestConfig,
} from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import z from "zod";
import { getToolBuilderContext } from "../context/context-builders.js";
import { BUILD_TOOL_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { LanguageModel, LLMMessage, LLMToolWithContext } from "../llm/llm-base-model.js";
import { getWebSearchTool, searchDocumentationToolDefinition } from "../llm/llm-tools.js";
import { logMessage } from "../utils/logs.js";

export class ToolBuilder {
  private systems: Record<string, System>;
  private instruction: string;
  private initialPayload: Record<string, unknown>;
  private metadata: ServiceMetadata;
  private outputSchema: JSONSchema;
  private inputSchema: JSONSchema;
  private toolSchema: any;

  constructor(
    instruction: string,
    systems: System[],
    initialPayload: Record<string, unknown>,
    outputSchema: JSONSchema,
    metadata: ServiceMetadata,
  ) {
    this.systems = systems.reduce(
      (acc, int) => {
        acc[int.id] = int;
        return acc;
      },
      {} as Record<string, System>,
    );
    this.instruction = instruction;
    this.initialPayload = initialPayload || {};
    this.metadata = metadata;
    this.outputSchema = outputSchema;
    this.toolSchema = z.toJSONSchema(toolSchema);
    try {
      const credentials = Object.values(this.systems).reduce((acc, int) => {
        return {
          ...acc,
          ...Object.entries(int.credentials || {}).reduce(
            (obj, [name, value]) => ({ ...obj, [`${int.id}_${name}`]: value }),
            {},
          ),
        };
      }, {});
      const rawSchema = toJsonSchema(
        {
          payload: this.initialPayload,
          credentials: credentials,
        },
        { arrays: { mode: "all" }, required: true, requiredDepth: 2 },
      );
      this.inputSchema = convertRequiredToArray(rawSchema) as JSONSchema;
    } catch (error) {
      logMessage("error", `Error during payload parsing: ${error}`, this.metadata);
      throw new Error(`Error during payload parsing: ${error}`);
    }
  }

  private prepareBuildingContext(): LLMMessage[] {
    const buildingPromptForAgent = getToolBuilderContext(
      {
        systems: Object.values(this.systems),
        payload: this.initialPayload,
        userInstruction: this.instruction,
        outputSchema: this.outputSchema,
        metadata: this.metadata,
      },
      {
        characterBudget: 120000,
        include: {
          systemContext: true,
          availableVariablesContext: true,
          payloadContext: true,
          userInstruction: true,
        },
      },
    );

    return [
      { role: "system", content: BUILD_TOOL_SYSTEM_PROMPT },
      { role: "user", content: buildingPromptForAgent },
    ];
  }

  private validateTool(tool: Tool): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const availableSystemIds = Object.keys(this.systems);
    const hasSteps = tool.steps && tool.steps.length > 0;
    const hasOutputTransform =
      tool.outputTransform &&
      tool.outputTransform !== "$" &&
      tool.outputTransform !== "(sourceData) => sourceData";

    if (!hasSteps && !hasOutputTransform) {
      errors.push("Tool must have either steps or an outputTransform to process data");
    }

    // Check if any steps are request steps (need systems)
    const hasRequestSteps = hasSteps && tool.steps?.some((step) => isRequestConfig(step.config));

    if (hasRequestSteps && availableSystemIds.length === 0) {
      errors.push("Tool has request steps but no systems are available. Please provide systems.");
    }

    if (hasSteps) {
      tool.steps?.forEach((step, index) => {
        // All steps are request steps for now
        const stepConfig = step.config as RequestStepConfig;
        if (!stepConfig.systemId) {
          errors.push(`Step ${index + 1} (${step.id}): Missing systemId in config`);
        } else if (!availableSystemIds.includes(stepConfig.systemId)) {
          errors.push(
            `Step ${index + 1} (${step.id}): Invalid systemId '${stepConfig.systemId}'. Available systems: ${availableSystemIds.join(", ")}`,
          );
        }
        if (!stepConfig?.url) {
          errors.push(
            `Step ${index + 1} (${step.id}): Missing URL configuration (url: '${stepConfig?.url || "undefined"}'). Please ensure that all steps correspond to a single API call, or merge this step with the previous one.`,
          );
        }
      });
    }

    if (!hasSteps && Object.keys(this.initialPayload).length === 0) {
      errors.push("Tool is missing steps and initial payload. You probably need to add steps.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public async buildTool(): Promise<Tool> {
    const maxRetries = 3;
    let messages = this.prepareBuildingContext();
    let lastError: string | null = null;

    const webSearchTool = getWebSearchTool();
    const firstSystem = Object.values(this.systems)[0];
    const tools: LLMToolWithContext[] = [
      {
        toolDefinition: searchDocumentationToolDefinition,
        toolContext: {
          orgId: this.metadata.orgId,
          traceId: this.metadata.traceId,
          system: firstSystem,
        },
        maxUses: 3,
      },
    ];
    if (webSearchTool) {
      tools.push({ toolDefinition: { web_search: webSearchTool }, toolContext: {} });
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logMessage(
          "info",
          `Building tool${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries})` : ""}`,
          this.metadata,
        );

        if (attempt > 0 && lastError) {
          messages.push({
            role: "user",
            content: `The previous attempt failed with: "${lastError}". Please fix this issue in your new attempt.`,
          } as LLMMessage);
        }

        const generateToolResult = await LanguageModel.generateObject<Tool>({
          messages,
          schema: this.toolSchema,
          temperature: 0.0,
          tools,
          metadata: this.metadata,
        });

        messages = generateToolResult.messages;

        if (!generateToolResult.success) {
          throw new Error(`Error generating tool: ${generateToolResult.response}`);
        }

        const generatedTool = generateToolResult.response;

        if (!Array.isArray(generatedTool.steps)) {
          throw new Error(
            `LLM returned invalid tool structure: steps must be an array, got ${typeof generatedTool.steps}: ${typeof generatedTool.steps === "object" ? JSON.stringify(generatedTool.steps, null, 2) : generatedTool.steps}`,
          );
        }

        generatedTool.steps = generatedTool.steps.map((step) => {
          const stepConfig = step.config as RequestStepConfig;
          return {
            ...step,
            modify: step.modify || false,
            config: {
              ...stepConfig,
              queryParams: stepConfig.queryParams
                ? Object.fromEntries(
                    (stepConfig.queryParams as any).map((p: any) => [p.key, p.value]),
                  )
                : undefined,
              headers: stepConfig.headers
                ? Object.fromEntries((stepConfig.headers as any).map((h: any) => [h.key, h.value]))
                : undefined,
            },
          };
        });

        const validation = this.validateTool(generatedTool);
        if (!validation.valid) {
          const errorDetails = validation.errors.join("\n");
          const toolSummary = JSON.stringify(
            {
              id: generatedTool.id,
              steps: generatedTool.steps?.map((s) => ({
                id: s.id,
                systemId: (s.config as RequestStepConfig)?.systemId,
                url: (s.config as RequestStepConfig)?.url,
              })),
            },
            null,
            2,
          );

          throw new Error(
            `Tool validation failed:\n${errorDetails}\n\nGenerated tool:\n${toolSummary}`,
          );
        }

        generatedTool.instruction = this.instruction;
        generatedTool.outputSchema = this.outputSchema;

        logMessage("info", "Tool built successfully", this.metadata);

        return {
          id: generatedTool.id,
          steps: generatedTool.steps,
          instruction: this.instruction,
          outputTransform: generatedTool.outputTransform,
          outputSchema: this.outputSchema,
          inputSchema: this.inputSchema,
          createdAt: generatedTool.createdAt || new Date(),
          updatedAt: generatedTool.updatedAt || new Date(),
        };
      } catch (error: any) {
        lastError = error.message;
        logMessage(
          "error",
          `Error during tool build attempt ${attempt + 1}: ${error.message}`,
          this.metadata,
        );
      }
    }

    const finalErrorMsg = `Tool build failed after ${maxRetries} attempts. Last error: ${lastError}`;
    logMessage("error", finalErrorMsg, this.metadata);
    throw new Error(finalErrorMsg);
  }
}

// Request step config schema - for HTTP, SFTP, Postgres, etc.
const requestStepConfigSchema = z.object({
  type: z.literal("request").optional().describe("Step type: 'request' for API calls"),
  systemId: z
    .string()
    .describe(
      "REQUIRED for request steps: The system ID for this step (must match one of the available system IDs)",
    ),
  url: z
    .string()
    .describe(
      "Full URL for the API endpoint (e.g., https://api.example.com/v1/users). Must not be empty.",
    ),
  method: z
    .enum(Object.values(HttpMethod) as [string, ...string[]])
    .describe(
      "HTTP method (MUST be a literal value, not a variable or expression): GET, POST, PUT, DELETE, or PATCH",
    ),
  queryParams: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .optional()
    .describe(
      "Query parameters as key-value pairs. If pagination is configured, ensure you have included the right pagination parameters here or in the body.",
    ),
  headers: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .optional()
    .describe(
      "HTTP headers as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions",
    ),
  body: z
    .string()
    .optional()
    .describe(
      "Request body. Use <<variable>> syntax for dynamic values. If pagination is configured, ensure you have included the right pagination parameters here or in the queryParams.",
    ),
  pagination: z
    .object({
      type: z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED"]),
      pageSize: z
        .string()
        .describe(
          "Number of items per page (e.g., '50', '100'). Once set, this becomes available as <<limit>> (same as pageSize).",
        ),
      cursorPath: z
        .string()
        .describe(
          'If cursor_based: The JSONPath to the cursor in the response. If not, set this to ""',
        ),
      stopCondition: z
        .string()
        .describe(
          "REQUIRED: JavaScript function that determines when to stop pagination. This is the primary control for pagination. Format: (response, pageInfo) => boolean. The pageInfo object contains: page (number), offset (number), cursor (any), totalFetched (number). response is the axios response object, access response data via response.data. Return true to STOP. E.g. (response, pageInfo) => !response.data.pagination.has_more",
        ),
    })
    .optional()
    .describe(
      "OPTIONAL: Only configure if you are using pagination variables in the URL, headers, or body. For OFFSET_BASED, ALWAYS use <<offset>>. If PAGE_BASED, ALWAYS use <<page>>. If CURSOR_BASED, ALWAYS use <<cursor>>.",
    ),
});

const toolSchema = z.object({
  id: z.string().describe("The tool ID (e.g., 'stripe-create-order')"),
  steps: z
    .array(
      z.object({
        id: z
          .string()
          .describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails')"),
        instruction: z
          .string()
          .optional()
          .describe(
            "A concise instruction describing WHAT this step does - what data it retrieves or what action it performs.",
          ),
        dataSelector: z
          .string()
          .optional()
          .describe(
            "JavaScript function that returns OBJECT for direct execution or ARRAY for loop execution. If returns OBJECT (including {}), step executes once with object as currentItem. If returns ARRAY, step executes once per array item. Examples: (sourceData) => ({ userId: sourceData.userId }) OR (sourceData) => sourceData.getContacts.data.filter(c => c.active)",
          ),
        modify: z
          .boolean()
          .optional()
          .describe(
            "Marks whether this operation modifies data on the system it operates on (writes, updates, deletes). Read-only operations should be false. Default is false.",
          ),
        config: requestStepConfigSchema.describe(
          "Step configuration with systemId, url, method for API calls",
        ),
      }),
    )
    .describe("Array of workflow steps."),
  outputTransform: z
    .string()
    .describe(
      "JavaScript function to transform the final workflow output to match outputSchema. NEVER include newlines or tabs in the code.",
    ),
});

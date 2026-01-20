import { System, ServiceMetadata, Tool, ToolDiff, ToolStepResult } from "@superglue/shared";
import jsonpatch from "fast-json-patch";
import z from "zod";
import { FIX_TOOL_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { LanguageModel, LLMMessage } from "../llm/llm-base-model.js";
import { logMessage } from "../utils/logs.js";

type Operation = jsonpatch.Operation;

export interface ToolFixerOptions {
  tool: Tool;
  fixInstructions: string;
  systems: System[];
  lastError?: string;
  stepResults?: ToolStepResult[];
  metadata: ServiceMetadata;
}

export interface ToolFixerResult {
  tool: Tool;
  diffs: ToolDiff[];
}

const patchSchema = z.object({
  patches: z
    .array(
      z.object({
        op: z
          .enum(["add", "remove", "replace", "move", "copy", "test"])
          .describe("The JSON Patch operation type (RFC 6902)"),
        path: z
          .string()
          .describe(
            "JSON Pointer path to the target location (e.g., '/steps/0/apiConfig/body', '/finalTransform', '/steps/-' for append)",
          ),
        value: z
          .any()
          .optional()
          .describe("The value to set (required for add, replace, test operations)"),
        from: z.string().optional().describe("Source path for move and copy operations"),
      }),
    )
    .describe("Array of RFC 6902 JSON Patch operations to apply to the tool configuration"),
});

export class ToolFixer {
  private tool: Tool;
  private fixInstructions: string;
  private systems: Record<string, System>;
  private lastError?: string;
  private stepResults?: ToolStepResult[];
  private metadata: ServiceMetadata;
  private diffSchemaJson: any;

  constructor(options: ToolFixerOptions) {
    this.tool = options.tool;
    this.fixInstructions = options.fixInstructions;
    this.systems = options.systems.reduce(
      (acc, int) => {
        acc[int.id] = int;
        return acc;
      },
      {} as Record<string, System>,
    );
    this.lastError = options.lastError;
    this.stepResults = options.stepResults;
    this.metadata = options.metadata;
    this.diffSchemaJson = z.toJSONSchema(patchSchema);
  }

  private trimToolForLLM(tool: Tool): Partial<Tool> {
    return {
      id: tool.id,
      instruction: tool.instruction,
      inputSchema: tool.inputSchema,
      responseSchema: tool.responseSchema,
      finalTransform: tool.finalTransform,
      steps: tool.steps.map((step) => this.trimStepForLLM(step)),
    };
  }

  private trimStepForLLM(step: any): any {
    return {
      id: step.id,
      systemId: step.systemId,
      executionMode: step.executionMode,
      loopSelector: step.loopSelector,
      failureBehavior: step.failureBehavior,
      apiConfig: this.trimApiConfigForLLM(step.apiConfig),
    };
  }

  private trimApiConfigForLLM(config: any): any {
    if (!config) return config;
    return {
      id: config.id,
      instruction: config.instruction,
      urlHost: config.urlHost,
      urlPath: config.urlPath,
      method: config.method,
      queryParams: config.queryParams,
      headers: config.headers,
      body: config.body,
      pagination: config.pagination,
    };
  }

  private serializeToolForLLM(): string {
    return JSON.stringify(this.trimToolForLLM(this.tool));
  }

  private prepareFixContext(serializedTool: string): LLMMessage[] {
    let userContent = `<current_tool_json>
${serializedTool}
</current_tool_json>

<fix_instructions>
${this.fixInstructions}
</fix_instructions>`;

    if (this.lastError) {
      userContent += `\n\n<last_error>
${this.lastError}
</last_error>`;
    }

    if (this.stepResults && this.stepResults.length > 0) {
      const stepResultsSummary = this.stepResults.map((sr) => ({
        stepId: sr.stepId,
        success: sr.success,
        error: sr.error,
      }));
      userContent += `\n\n<step_results>
${JSON.stringify(stepResultsSummary, null, 2)}
</step_results>`;
    }

    const availableSystemIds = Object.keys(this.systems);
    if (availableSystemIds.length > 0) {
      userContent += `\n\n<available_system_ids>
${availableSystemIds.join(", ")}
</available_system_ids>`;
    }

    return [
      { role: "system", content: FIX_TOOL_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
  }

  /**
   * Validate JSON Patch operations
   */
  private validatePatches(patches: Operation[]): { valid: boolean; error?: string } {
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];

      if (!patch.op) {
        return { valid: false, error: `Patch ${i + 1}: missing 'op' field` };
      }

      if (!patch.path) {
        return { valid: false, error: `Patch ${i + 1}: missing 'path' field` };
      }

      // Validate required fields based on operation type
      if (["add", "replace", "test"].includes(patch.op) && !("value" in patch)) {
        return {
          valid: false,
          error: `Patch ${i + 1}: '${patch.op}' operation requires 'value' field`,
        };
      }

      if (["move", "copy"].includes(patch.op) && !("from" in patch)) {
        return {
          valid: false,
          error: `Patch ${i + 1}: '${patch.op}' operation requires 'from' field`,
        };
      }

      // Validate path format (should start with /)
      if (!patch.path.startsWith("/")) {
        return {
          valid: false,
          error: `Patch ${i + 1}: path must start with '/' (RFC 6902), got '${patch.path}'`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Apply JSON Patch operations to the tool
   */
  private applyPatches(tool: Tool, patches: Operation[]): { tool?: Tool; error?: string } {
    try {
      // Deep clone the tool to avoid mutations
      const toolCopy = JSON.parse(JSON.stringify(tool));

      // Apply all patches - applyPatch returns the patched document
      const result = jsonpatch.applyPatch(
        toolCopy,
        patches,
        /* validate */ true,
        /* mutate */ true,
      );

      // result.newDocument contains the patched tool
      return { tool: result.newDocument || toolCopy };
    } catch (error: any) {
      return { error: `Error applying patches: ${error.message}` };
    }
  }

  /**
   * Validate the modified tool structure
   */
  private validateTool(tool: Tool): { valid: boolean; error?: string } {
    try {
      // Basic validation
      if (!tool.id || typeof tool.id !== "string") {
        return { valid: false, error: "Tool must have a valid 'id' string" };
      }

      if (!Array.isArray(tool.steps)) {
        return { valid: false, error: "Tool must have a 'steps' array" };
      }

      // Validate steps
      const availableSystemIds = Object.keys(this.systems);
      for (let i = 0; i < tool.steps.length; i++) {
        const step = tool.steps[i];
        if (!step.id) {
          return { valid: false, error: `Step ${i + 1}: missing 'id'` };
        }
        if (!step.apiConfig) {
          return { valid: false, error: `Step ${i + 1} (${step.id}): missing 'apiConfig'` };
        }
        if (
          step.systemId &&
          availableSystemIds.length > 0 &&
          !availableSystemIds.includes(step.systemId)
        ) {
          return {
            valid: false,
            error: `Step ${i + 1} (${step.id}): invalid systemId '${step.systemId}'. Available: ${availableSystemIds.join(", ")}`,
          };
        }
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: `Tool validation error: ${error.message}` };
    }
  }

  /**
   * Main method to fix the tool using LLM-generated JSON Patches
   */
  public async fixTool(): Promise<ToolFixerResult> {
    const maxRetries = 5;
    const serializedTool = this.serializeToolForLLM();
    let messages = this.prepareFixContext(serializedTool);
    let lastAttemptError: string | null = null;
    let lastAttemptedPatches: Operation[] | null = null;
    let appliedPatches: Operation[] = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logMessage(
          "info",
          `Fixing tool${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries})` : ""}`,
          this.metadata,
        );

        // Log fix instructions on first attempt for debugging
        if (attempt === 0) {
          logMessage(
            "debug",
            `Fix instructions: ${this.fixInstructions.substring(0, 500)}${this.fixInstructions.length > 500 ? "..." : ""}`,
            this.metadata,
          );
        }

        if (attempt > 0 && lastAttemptError) {
          let retryMessage = `The previous patch attempt failed: "${lastAttemptError}".`;
          if (lastAttemptedPatches && lastAttemptedPatches.length > 0) {
            // Show the patches that were attempted so the LLM can see what went wrong
            const patchesPreview = lastAttemptedPatches
              .map((p, i) => `Patch ${i + 1}: ${JSON.stringify(p)}`)
              .join("\n");
            retryMessage += `\n\nYour attempted patches were:\n${patchesPreview}`;
          }
          retryMessage += "\n\nPlease fix this issue and try again with corrected patches.";
          messages.push({
            role: "user",
            content: retryMessage,
          } as LLMMessage);
        }

        const generatePatchResult = await LanguageModel.generateObject<z.infer<typeof patchSchema>>(
          {
            messages,
            schema: this.diffSchemaJson,
            temperature: 0.0,
            metadata: this.metadata,
          },
        );

        messages = generatePatchResult.messages;

        if (!generatePatchResult.success) {
          throw new Error(`Error generating patches: ${generatePatchResult.response}`);
        }

        let { patches: rawPatches } = generatePatchResult.response;

        // Handle LLM returning single patch object instead of array
        if (rawPatches && !Array.isArray(rawPatches)) {
          rawPatches = [rawPatches];
        }

        if (!rawPatches || rawPatches.length === 0) {
          throw new Error("LLM returned no patches. At least one change is required.");
        }

        const patches = rawPatches as Operation[];

        // Log what the LLM is attempting
        logMessage(
          "debug",
          `LLM generated ${patches.length} patch(es):\n` +
            patches.map((p, idx) => `  Patch ${idx + 1}: ${p.op} ${p.path}`).join("\n"),
          this.metadata,
        );

        lastAttemptedPatches = patches;

        // Validate patches
        const validation = this.validatePatches(patches);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Apply patches to the tool
        const patchResult = this.applyPatches(this.tool, patches);
        if (patchResult.error) {
          throw new Error(patchResult.error);
        }

        // Validate the resulting tool
        const toolValidation = this.validateTool(patchResult.tool!);
        if (!toolValidation.valid) {
          throw new Error(toolValidation.error);
        }

        appliedPatches = patches;

        // Preserve original metadata
        const fixedTool: Tool = {
          ...patchResult.tool!,
          instruction: this.tool.instruction,
          systemIds: this.tool.systemIds,
          createdAt: this.tool.createdAt,
          updatedAt: new Date(),
        };

        logMessage(
          "info",
          `Tool fixed successfully with ${patches.length} patch(es)`,
          this.metadata,
        );

        // Return patches directly as ToolDiff (same format now)
        const diffs: ToolDiff[] = patches.map((p) => {
          const diff: ToolDiff = {
            op: p.op as ToolDiff["op"],
            path: p.path,
          };
          if ("value" in p) diff.value = p.value;
          if ("from" in p && p.from) diff.from = p.from;
          return diff;
        });

        return {
          tool: fixedTool,
          diffs,
        };
      } catch (error: any) {
        lastAttemptError = error.message;
        logMessage(
          "error",
          `Error during tool fix attempt ${attempt + 1}: ${error.message}`,
          this.metadata,
        );
      }
    }

    const finalErrorMsg = `Tool fix failed after ${maxRetries} attempts. Last error: ${lastAttemptError}`;
    logMessage("error", finalErrorMsg, this.metadata);
    throw new Error(finalErrorMsg);
  }
}

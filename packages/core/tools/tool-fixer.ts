import { Integration, ServiceMetadata, Tool, ToolDiff, ToolStepResult } from "@superglue/shared";
import z from "zod";
import { FIX_TOOL_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { parseJsonResilient } from "../files/parsers/json.js";
import { LanguageModel, LLMMessage } from "../llm/llm-base-model.js";
import { logMessage } from "../utils/logs.js";

export interface ToolFixerOptions {
  tool: Tool;
  fixInstructions: string;
  integrations: Integration[];
  lastError?: string;
  stepResults?: ToolStepResult[];
  metadata: ServiceMetadata;
}

export interface ToolFixerResult {
  tool: Tool;
  diffs: ToolDiff[];
}

const diffSchema = z.object({
  diffs: z
    .array(
      z.object({
        old_string: z
          .string()
          .describe(
            "The exact string to find and replace. Must be unique within the tool JSON. Include enough context (surrounding text) to make it unique.",
          ),
        new_string: z
          .string()
          .describe("The replacement string. Can be empty to delete the old_string."),
      }),
    )
    .describe("Array of search/replace operations to apply to the tool JSON"),
});

export class ToolFixer {
  private tool: Tool;
  private fixInstructions: string;
  private integrations: Record<string, Integration>;
  private lastError?: string;
  private stepResults?: ToolStepResult[];
  private metadata: ServiceMetadata;
  private diffSchemaJson: any;

  constructor(options: ToolFixerOptions) {
    this.tool = options.tool;
    this.fixInstructions = options.fixInstructions;
    this.integrations = options.integrations.reduce(
      (acc, int) => {
        acc[int.id] = int;
        return acc;
      },
      {} as Record<string, Integration>,
    );
    this.lastError = options.lastError;
    this.stepResults = options.stepResults;
    this.metadata = options.metadata;
    this.diffSchemaJson = z.toJSONSchema(diffSchema);
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
      integrationId: step.integrationId,
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

    const availableIntegrationIds = Object.keys(this.integrations);
    if (availableIntegrationIds.length > 0) {
      userContent += `\n\n<available_integration_ids>
${availableIntegrationIds.join(", ")}
</available_integration_ids>`;
    }

    return [
      { role: "system", content: FIX_TOOL_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
  }

  private tryNormalizeForJsonString(
    str: string,
    serializedTool: string,
  ): { normalized: string; type: "escaped" | "collapsed" } | null {
    // If the string contains actual newlines, try escaping them
    if (str.includes("\n")) {
      const escaped = str.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      if (this.countOccurrences(serializedTool, escaped) === 1) {
        return { normalized: escaped, type: "escaped" };
      }
      // Also try collapsing newlines/whitespace entirely (for compact JSON)
      const collapsed = str.replace(/\s+/g, "");
      if (this.countOccurrences(serializedTool, collapsed) === 1) {
        return { normalized: collapsed, type: "collapsed" };
      }
    }
    return null;
  }

  /**
   * Try to find a fuzzy match for a string that doesn't exist exactly.
   * Attempts to find a unique match by:
   * 1. Trimming whitespace
   * 2. Normalizing whitespace
   * 3. Finding a core substring that matches uniquely
   */
  private tryFuzzyMatch(str: string, serializedTool: string): string | null {
    // Try trimming whitespace from each line
    const trimmedLines = str
      .split("\n")
      .map((l) => l.trim())
      .join("\n");
    if (trimmedLines !== str && this.countOccurrences(serializedTool, trimmedLines) === 1) {
      return trimmedLines;
    }

    // Try finding a unique core substring (at least 50 chars from middle)
    const minCoreLength = Math.min(50, str.length);
    if (str.length >= minCoreLength) {
      // Try to find a unique portion from the start
      for (let len = minCoreLength; len <= str.length; len += 10) {
        const core = str.substring(0, len);
        if (this.countOccurrences(serializedTool, core) === 1) {
          // Found a unique prefix, now find where it ends in the tool and extract that section
          const startIdx = serializedTool.indexOf(core);
          // Try to match the intended length
          const actualStr = serializedTool.substring(startIdx, startIdx + str.length);
          if (this.countOccurrences(serializedTool, actualStr) === 1) {
            return actualStr;
          }
        }
      }
    }

    return null;
  }

  /**
   * Validate that all diffs can be applied:
   * - Each old_string must exist in the serialized tool
   * - Each old_string must be unique (appear exactly once)
   * - Automatically normalizes strings with newlines for JSON matching
   */
  private validateDiffs(
    diffs: ToolDiff[],
    serializedTool: string,
  ): { valid: boolean; error?: string; normalizedDiffs?: ToolDiff[] } {
    const normalizedDiffs: ToolDiff[] = [];

    for (let i = 0; i < diffs.length; i++) {
      const diff = diffs[i];

      if (!diff.old_string) {
        return { valid: false, error: `Diff ${i + 1}: old_string cannot be empty` };
      }

      let occurrences = this.countOccurrences(serializedTool, diff.old_string);
      let normalizedOldString = diff.old_string;
      let normalizedNewString = diff.new_string;

      // If not found, try normalizing for JSON string escaping
      if (occurrences === 0) {
        const normResult = this.tryNormalizeForJsonString(diff.old_string, serializedTool);
        if (normResult) {
          normalizedOldString = normResult.normalized;
          // Apply same normalization to new_string
          if (normResult.type === "escaped" && diff.new_string.includes("\n")) {
            normalizedNewString = diff.new_string
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r")
              .replace(/\t/g, "\\t");
          } else if (normResult.type === "collapsed") {
            normalizedNewString = diff.new_string.replace(/\s+/g, "");
          }
          occurrences = 1;
          logMessage(
            "info",
            `Diff ${i + 1}: Auto-normalized (${normResult.type}) for JSON match`,
            this.metadata,
          );
        }
      }

      // If still not found, try fuzzy matching
      if (occurrences === 0) {
        const fuzzyMatch = this.tryFuzzyMatch(diff.old_string, serializedTool);
        if (fuzzyMatch) {
          normalizedOldString = fuzzyMatch;
          occurrences = 1;
          logMessage("info", `Diff ${i + 1}: Found fuzzy match for old_string`, this.metadata);
        }
      }

      if (occurrences === 0) {
        // Provide a more helpful error message with actual content hint
        const hasNewlines = diff.old_string.includes("\n");
        const hint = hasNewlines
          ? " Note: Your old_string contains actual newlines. In JSON strings, newlines must be escaped as \\n (backslash-n)."
          : "";

        // Try to find what the LLM might have been looking for
        const searchKey = diff.old_string.match(/"(\w+)":\s*/)?.[1];
        let contextHint = "";
        if (searchKey) {
          const keyPattern = `"${searchKey}":`;
          const keyIdx = serializedTool.indexOf(keyPattern);
          if (keyIdx !== -1) {
            const actualContent = serializedTool.substring(keyIdx, keyIdx + 150);
            contextHint = ` The key "${searchKey}" exists. Actual content starts with: ${actualContent}...`;
          }
        }

        return {
          valid: false,
          error: `Diff ${i + 1}: old_string not found in tool JSON. The string "${diff.old_string.substring(0, 100)}${diff.old_string.length > 100 ? "..." : ""}" does not exist.${hint}${contextHint}`,
        };
      }

      if (occurrences > 1) {
        return {
          valid: false,
          error: `Diff ${i + 1}: old_string is not unique (found ${occurrences} occurrences). Include more surrounding context to make it unique.`,
        };
      }

      if (
        normalizedNewString.includes("\n") ||
        normalizedNewString.includes("\r") ||
        normalizedNewString.includes("\t")
      ) {
        normalizedNewString = normalizedNewString
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
      }

      normalizedDiffs.push({
        old_string: normalizedOldString,
        new_string: normalizedNewString,
      });
    }

    return { valid: true, normalizedDiffs };
  }

  /**
   * Count occurrences of a substring in a string
   */
  private countOccurrences(str: string, substr: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = str.indexOf(substr, pos)) !== -1) {
      count++;
      pos += 1;
    }
    return count;
  }

  /**
   * Apply diffs sequentially to the serialized tool
   */
  private applyDiffs(serializedTool: string, diffs: ToolDiff[]): string {
    let result = serializedTool;
    for (const diff of diffs) {
      result = result.replace(diff.old_string, diff.new_string);
    }
    return result;
  }

  /**
   * Parse the modified JSON back to a Tool object and validate it
   */
  private parseAndValidateTool(modifiedJson: string): {
    valid: boolean;
    tool?: Tool;
    error?: string;
  } {
    const parseResult = parseJsonResilient(modifiedJson);

    if (!parseResult.success) {
      return { valid: false, error: `Invalid JSON: ${parseResult.error}` };
    }

    if (parseResult.repairs && parseResult.repairs.length > 0) {
      logMessage("info", `JSON repaired with: ${parseResult.repairs.join(", ")}`, this.metadata);
    }

    const parsed = parseResult.data;

    if (!parsed.id || typeof parsed.id !== "string") {
      return { valid: false, error: "Tool must have a valid 'id' string" };
    }

    if (!Array.isArray(parsed.steps)) {
      return { valid: false, error: "Tool must have a 'steps' array" };
    }

    const availableIntegrationIds = Object.keys(this.integrations);
    for (let i = 0; i < parsed.steps.length; i++) {
      const step = parsed.steps[i];
      if (!step.id) {
        return { valid: false, error: `Step ${i + 1}: missing 'id'` };
      }
      if (!step.apiConfig) {
        return { valid: false, error: `Step ${i + 1} (${step.id}): missing 'apiConfig'` };
      }
      if (
        step.integrationId &&
        availableIntegrationIds.length > 0 &&
        !availableIntegrationIds.includes(step.integrationId)
      ) {
        return {
          valid: false,
          error: `Step ${i + 1} (${step.id}): invalid integrationId '${step.integrationId}'. Available: ${availableIntegrationIds.join(", ")}`,
        };
      }
    }

    return { valid: true, tool: parsed as Tool };
  }

  /**
   * Main method to fix the tool using LLM-generated diffs
   */
  public async fixTool(): Promise<ToolFixerResult> {
    const maxRetries = 5;
    const serializedTool = this.serializeToolForLLM();
    let messages = this.prepareFixContext(serializedTool);
    let lastAttemptError: string | null = null;
    let appliedDiffs: ToolDiff[] = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logMessage(
          "info",
          `Fixing tool${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries})` : ""}`,
          this.metadata,
        );

        if (attempt > 0 && lastAttemptError) {
          messages.push({
            role: "user",
            content: `The previous diff attempt failed: "${lastAttemptError}". Please fix this issue and try again with corrected diffs.`,
          } as LLMMessage);
        }

        const generateDiffResult = await LanguageModel.generateObject<z.infer<typeof diffSchema>>({
          messages,
          schema: this.diffSchemaJson,
          temperature: 0.0,
          metadata: this.metadata,
        });

        messages = generateDiffResult.messages;

        if (!generateDiffResult.success) {
          throw new Error(`Error generating diffs: ${generateDiffResult.response}`);
        }

        let { diffs: rawDiffs } = generateDiffResult.response;

        // Handle LLM returning single diff object instead of array
        if (rawDiffs && !Array.isArray(rawDiffs)) {
          rawDiffs = [rawDiffs];
        }

        if (!rawDiffs || rawDiffs.length === 0) {
          throw new Error("LLM returned no diffs. At least one change is required.");
        }

        // Convert to ToolDiff[], validating that required fields are present
        const diffs: ToolDiff[] = rawDiffs.map((d: any, i: number) => {
          if (!d.old_string || d.new_string === undefined) {
            throw new Error(`Diff ${i + 1}: missing required field (old_string or new_string)`);
          }
          return {
            old_string: d.old_string,
            new_string: d.new_string ?? "",
          };
        });

        // Validate diffs (and get normalized versions if needed)
        const validation = this.validateDiffs(diffs, serializedTool);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Use normalized diffs if available (handles JSON string escaping)
        const diffsToApply = validation.normalizedDiffs || diffs;

        // Apply diffs
        const modifiedJson = this.applyDiffs(serializedTool, diffsToApply);

        // Parse and validate the result
        const parseResult = this.parseAndValidateTool(modifiedJson);
        if (!parseResult.valid) {
          throw new Error(parseResult.error);
        }

        appliedDiffs = diffsToApply;

        // Preserve original metadata
        const fixedTool: Tool = {
          ...parseResult.tool!,
          instruction: this.tool.instruction,
          integrationIds: this.tool.integrationIds,
          createdAt: this.tool.createdAt,
          updatedAt: new Date(),
        };

        logMessage("info", `Tool fixed successfully with ${diffs.length} diff(s)`, this.metadata);

        return {
          tool: fixedTool,
          diffs: appliedDiffs,
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
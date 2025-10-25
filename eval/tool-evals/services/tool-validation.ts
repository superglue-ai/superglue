import { ToolConfig, ValidationResult, ValidationLLMConfig, AttemptStatus } from "../types.js";
import { WorkflowResult } from "@superglue/client";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

const MAX_OUTPUT_FOR_LLM = 3000;

export class ToolValidationService {
    private validationLlmConfig: ValidationLLMConfig;

    constructor(validationLlmConfig?: ValidationLLMConfig) {
        this.validationLlmConfig = validationLlmConfig || {
            provider: "openai",
            model: "gpt-4o",
        };
    }

    public async validate(
        toolConfig: ToolConfig,
        workflowResult: WorkflowResult
    ): Promise<ValidationResult> {
        const skipFunction = toolConfig.skipValidationFunction === true;

        let functionError: string | undefined;
        let functionPassed = false;

        // Run validation function if provided and not skipped
        if (!skipFunction && toolConfig.validationFunction) {
            try {
                await this.runValidationFunction(toolConfig, workflowResult);
                functionPassed = true;
            } catch (error) {
                functionError = error instanceof Error ? error.message : String(error);
            }
        } else if (skipFunction) {
            // Function was skipped - treat as "not passed" to trigger LLM
            functionPassed = false;
        } else {
            // No validation function at all - treat as passed
            functionPassed = true;
        }

        // If function passed, we're done - no need for LLM
        if (functionPassed && !skipFunction && toolConfig.validationFunction) {
            return {
                passed: true,
                functionPassed: true,
            };
        }

        // Function failed or was skipped - ask LLM
        const llmResult = await this.runLLMJudge(toolConfig, workflowResult, functionError);

        // Overall passed = LLM says "passes"
        const passed = llmResult.judgment === "passes";

        return {
            passed,
            functionPassed,
            functionError,
            llmJudgment: llmResult.judgment,
            llmReason: llmResult.reason,
        };
    }

    public determineStatus(
        attempt: {
            buildSuccess: boolean;
            executionSuccess: boolean;
            validationResult?: ValidationResult;
            toolConfig: ToolConfig;
        }
    ): AttemptStatus {
        if (!attempt.buildSuccess) {
            return AttemptStatus.BUILD_FAILED;
        }

        if (!attempt.executionSuccess) {
            return AttemptStatus.EXECUTION_FAILED;
        }

        if (!attempt.validationResult) {
            return AttemptStatus.VALIDATION_PASSED;
        }

        const { validationResult, toolConfig } = attempt;
        const skipFunction = toolConfig.skipValidationFunction === true;
        const hadFunctionError = validationResult.functionError !== undefined;

        if (!hadFunctionError && !skipFunction) {
            return AttemptStatus.VALIDATION_PASSED;
        }

        const prefix = skipFunction ? "VALIDATION_SKIPPED" : "VALIDATION_FAILED";

        switch (validationResult.llmJudgment) {
            case "passes":
                return AttemptStatus[`${prefix}_LLM_PASSED` as keyof typeof AttemptStatus];
            case "partial":
                return AttemptStatus[`${prefix}_LLM_PARTIAL` as keyof typeof AttemptStatus];
            case "failed":
                return AttemptStatus[`${prefix}_LLM_FAILED` as keyof typeof AttemptStatus];
            default:
                return AttemptStatus.VALIDATION_PASSED;
        }
    }

    private async runValidationFunction(
        toolConfig: ToolConfig,
        workflowResult: WorkflowResult
    ): Promise<void> {
        if (!toolConfig.validationFunction) {
            return;
        }

        const baseDir = dirname(fileURLToPath(import.meta.url));
        const validatorPath = join(baseDir, "..", toolConfig.validationFunction);
        const validatorUrl = pathToFileURL(validatorPath).href;

        const validatorModule = await import(validatorUrl);
        const validatorFn = validatorModule.default;

        if (typeof validatorFn !== "function") {
            throw new Error(`Validator at ${toolConfig.validationFunction} does not export a default function`);
        }

        validatorFn(workflowResult.data, toolConfig.payload);
    }

    private async runLLMJudge(
        toolConfig: ToolConfig,
        workflowResult: WorkflowResult,
        functionError?: string
    ): Promise<{ judgment: "passes" | "partial" | "failed"; reason: string }> {
        const outputStr = JSON.stringify(workflowResult.data);
        const truncatedOutput = outputStr.length > MAX_OUTPUT_FOR_LLM 
            ? outputStr.substring(0, MAX_OUTPUT_FOR_LLM) + "... (truncated)"
            : outputStr;

        const prompt = this.buildLLMPrompt(
            toolConfig.instruction,
            truncatedOutput,
            toolConfig.expectedResultDescription,
            functionError
        );

        const openai = createOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const { object } = await generateObject({
            model: openai(this.validationLlmConfig.model),
            schema: z.object({
                judgment: z.enum(["passes", "partial", "failed"]),
                reason: z.string().max(200),
            }),
            prompt,
        });

        return object;
    }

    private buildLLMPrompt(
        instruction: string,
        output: string,
        expectedDescription?: string,
        functionError?: string
    ): string {
        let prompt = `You are evaluating if a workflow execution produced correct output.

Tool Instruction:
${instruction}

Actual Output:
${output}`;

        if (expectedDescription) {
            prompt += `\n\nExpected Result Description:
${expectedDescription}`;
        }

        prompt += `\n\nEvaluate if the output satisfies the instruction. Respond with:
- "passes" if the output fully meets the requirements (it can have minor issues like returning additional data, or having a slightly different format, but it should be correct overall)
- "partial" if the output is mostly correct but has minor issues like returning additional data, or missing one out of many required fields or items in the wrong order, or wrong json structure but correct content.
- "failed" if the output is incorrect or missing key requirements

Provide a brief one-sentence reason for your judgment.`;

        return prompt;
    }
}


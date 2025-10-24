import { ToolConfig, ValidationResult, ValidationLLMConfig, AttemptStatus } from "../types.js";
import { WorkflowResult } from "@superglue/client";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

const MAX_OUTPUT_FOR_LLM = 2000;

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

        if (!skipFunction && toolConfig.validationFunction) {
            try {
                await this.runValidationFunction(toolConfig, workflowResult);
                functionPassed = true;
            } catch (error) {
                functionError = error instanceof Error ? error.message : String(error);
            }
        }

        if (functionPassed) {
            return {
                passed: true,
            };
        }

        const llmResult = await this.runLLMJudge(toolConfig, workflowResult, functionError);

        const passed = llmResult.judgment === "passes";

        return {
            passed,
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

        if (functionError) {
            prompt += `\n\nValidation Function Error:
${functionError}`;
        }

        prompt += `\n\nEvaluate if the output satisfies the instruction. Respond with:
- "passes" if the output fully meets the requirements
- "partial" if the output is mostly correct but has minor issues
- "failed" if the output is incorrect or missing key requirements

Provide a brief one-sentence reason for your judgment.`;

        return prompt;
    }
}


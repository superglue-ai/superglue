import type { ServiceMetadata } from "@superglue/shared";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { ToolValidationService } from "../../tool-evals/services/tool-validation.js";
import {
  AttemptStatus,
  type IntegrationConfig,
  type ToolAttempt,
  type ToolConfig,
  ToolFailureReason,
} from "../../tool-evals/types.js";
import { CodeExecutor, type ExecutionResult } from "./code-executor.js";
import { LlmCodeGenerator } from "./llm-code-generator.js";

export class LlmToolRunner {
  private codeExecutor: CodeExecutor;
  private validationService: ToolValidationService;

  constructor(
    private metadata: ServiceMetadata,
    validationLlmConfig?: { provider: string; model: string },
  ) {
    this.codeExecutor = new CodeExecutor();
    this.validationService = new ToolValidationService(validationLlmConfig);
  }

  async runToolsForProvider(
    providerModel: any,
    providerName: string,
    tools: ToolConfig[],
    integrations: IntegrationConfig[],
  ): Promise<ToolAttempt[]> {
    const codeGenerator = new LlmCodeGenerator(providerModel, this.metadata);
    const attempts: ToolAttempt[] = [];

    for (const tool of tools) {
      logMessage("info", `Running tool ${tool.id} with provider ${providerName}`, this.metadata);

      const toolIntegrations = integrations.filter((i) => tool.integrationIds.includes(i.id));
      const attempt = await this.runSingleAttempt(tool, toolIntegrations, codeGenerator);
      attempts.push(attempt);

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return attempts;
  }

  private async runSingleAttempt(
    tool: ToolConfig,
    integrations: IntegrationConfig[],
    codeGenerator: LlmCodeGenerator,
  ): Promise<ToolAttempt> {
    const attempt: ToolAttempt = {
      toolConfig: tool,
      selfHealingEnabled: false,
      buildTime: null,
      buildSuccess: false,
      executionTime: null,
      executionSuccess: false,
      status: AttemptStatus.BUILD_FAILED,
      createdAt: new Date(),
    };

    // Build phase: generate code
    const buildStart = Date.now();
    try {
      const generatedCode = await codeGenerator.generate(tool, integrations);
      attempt.buildTime = Date.now() - buildStart;
      attempt.buildSuccess = true;

      // Execution phase: run code
      const execStart = Date.now();
      const executionResult = await this.codeExecutor.execute(generatedCode, tool.payload || {});
      attempt.executionTime = Date.now() - execStart;

      if (executionResult.success) {
        attempt.executionSuccess = true;
        attempt.result = { data: executionResult.data } as any;

        // Validation phase: LLM judge
        try {
          const validationResult = await this.validationService.validate(tool, {
            data: executionResult.data,
          } as any);
          attempt.validationResult = validationResult;
          attempt.status = this.validationService.determineStatus(attempt as any);

          if (!validationResult.passed) {
            attempt.failureReason = ToolFailureReason.VALIDATION;
          }
        } catch (validationError) {
          logMessage(
            "error",
            `Validation failed for tool ${tool.id}: ${validationError}`,
            this.metadata,
          );
          attempt.validationResult = {
            passed: false,
            functionPassed: false,
            functionError:
              validationError instanceof Error ? validationError.message : String(validationError),
          };
          attempt.status = AttemptStatus.VALIDATION_FAILED_LLM_FAILED;
          attempt.failureReason = ToolFailureReason.VALIDATION;
        }
      } else {
        attempt.executionSuccess = false;
        attempt.executionError = executionResult.error;
        attempt.status = AttemptStatus.EXECUTION_FAILED;
        attempt.failureReason = ToolFailureReason.EXECUTION;
        logMessage(
          "warn",
          `Execution failed for tool ${tool.id}: ${attempt.executionError}`,
          this.metadata,
        );
      }
    } catch (buildError) {
      attempt.buildTime = Date.now() - buildStart;
      attempt.buildSuccess = false;
      attempt.buildError = buildError instanceof Error ? buildError.message : String(buildError);
      attempt.status = AttemptStatus.BUILD_FAILED;
      attempt.failureReason = ToolFailureReason.BUILD;
      logMessage("warn", `Build failed for tool ${tool.id}: ${attempt.buildError}`, this.metadata);
    }

    return attempt;
  }
}

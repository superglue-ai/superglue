import { ToolAttempt } from "../types.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { Metadata } from "@superglue/shared";
import { AgentEvalConfig } from "../types.js";

export class JsonReporter {
  constructor(
    private baseDir: string,
    private metadata: Metadata,
    private attemptsPerMode: number
  ) {
  }

  public reportAttempts(timestamp: string, attempts: ToolAttempt[], config: AgentEvalConfig): void {
    const filepath = join(this.baseDir, `data/results/${timestamp}-tool-eval.json` );

    const llmProvider = process.env.LLM_PROVIDER || 'not_set';
    const backendModel = this.getBackendModel(llmProvider);
    
    const detailedAttempts = attempts.map(attempt => ({
      tool: attempt.toolConfig.id,
      toolName: attempt.toolConfig.name,
      description: attempt.toolConfig.expectedResultDescription ?? null,
      instruction: attempt.toolConfig.instruction,
      selfHealingEnabled: attempt.selfHealingEnabled,
      
      buildSuccess: attempt.buildSuccess,
      buildError: attempt.buildError ?? null,
      buildTime: attempt.buildTime,
      
      executionSuccess: attempt.executionSuccess,
      executionError: attempt.executionError ?? null,
      executionTime: attempt.executionTime,
      
      status: attempt.status,
      failureReason: attempt.failureReason ?? null,
      
      overallValidationPassed: attempt.validationResult?.passed ?? null,
      validationFunctionPassed: attempt.validationResult?.functionPassed ?? null,
      validationFunctionError: attempt.validationResult?.functionError ?? null,
      llmJudgment: attempt.validationResult?.llmJudgment ?? null,
      llmReason: attempt.validationResult?.llmReason ?? null,
      
      data: attempt.result?.data ?? null,
    }));

    const report = {
      config: {
        attemptsPerMode: this.attemptsPerMode,
        llmProvider: llmProvider,
        backendModel: backendModel,
        validationLlmProvider: config.validationLlmConfig?.provider || 'not_set',
        validationLlmModel: config.validationLlmConfig?.model || 'not_set',
      },
      results: detailedAttempts,
    };

    try {
      writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
      logMessage("info", `JSON report created: ${filepath}`, this.metadata);
    } catch (error) {
      logMessage("error", `Failed to write JSON report: ${error}`, this.metadata);
      
      const fallbackPath = join(this.baseDir, `data/results/${timestamp}-tool-eval-fallback.txt`);
      writeFileSync(fallbackPath, String(report), "utf-8");
      logMessage("info", `Fallback text report created: ${fallbackPath}`, this.metadata);
    }
  }

  private getBackendModel(provider: string): string {
    const providerLower = provider.toLowerCase();
    
    switch (providerLower) {
      case 'openai':
        return process.env.OPENAI_MODEL || 'not_set';
      case 'anthropic':
        return process.env.ANTHROPIC_MODEL || 'not_set';
      case 'gemini':
        return process.env.GEMINI_MODEL || 'not_set';
      case 'azure':
        return process.env.AZURE_MODEL || 'not_set';
      default:
        return 'not_set';
    }
  }
}


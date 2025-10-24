import { ToolAttempt } from "../types.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { Metadata } from "@superglue/shared";

export class JsonReporter {
  constructor(
    private baseDir: string,
    private metadata: Metadata
  ) {
  }

  public reportAttempts(timestamp: string, attempts: ToolAttempt[]): void {
    const filepath = join(this.baseDir, `data/results/agent-eval-${timestamp}.json` );

    const detailedAttempts = attempts.map(attempt => ({
      tool: attempt.workflow?.id ?? attempt.toolConfig.id,
      toolName: attempt.toolConfig.name,
      selfHealingEnabled: attempt.selfHealingEnabled,
      
      buildSuccess: attempt.buildSuccess,
      buildError: attempt.buildError ?? null,
      buildTime: attempt.buildTime,
      
      executionSuccess: attempt.executionSuccess,
      executionError: attempt.executionError ?? null,
      executionTime: attempt.executionTime,
      
      status: attempt.status,
      failureReason: attempt.failureReason ?? null,
      
      validationPassed: attempt.validationResult?.passed ?? null,
      validationFunctionError: attempt.validationResult?.functionError ?? null,
      llmJudgment: attempt.validationResult?.llmJudgment ?? null,
      llmReason: attempt.validationResult?.llmReason ?? null,
      
      data: attempt.result?.data ?? null,
    }));

    writeFileSync(filepath, JSON.stringify(detailedAttempts, null, 2), "utf-8");
    logMessage("info", `JSON report created: ${filepath}`, this.metadata);
  }
}


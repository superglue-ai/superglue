import { WorkflowAttempt } from "../types.js";
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

  public reportAttempts(timestamp: string, attempts: WorkflowAttempt[]): void {
    const filepath = join(this.baseDir, `data/results/agent-eval-${timestamp}.json` );

    const shortendAttempt = attempts.map(attempt => ({
      workflow: attempt.workflow.id,
      buildError: attempt.buildError ?? null,
      executionError: attempt.executionError ?? null,
      data: attempt.result?.data ?? null,
    }));

    writeFileSync(filepath, JSON.stringify(shortendAttempt, null, 2), "utf-8");
    logMessage("info", `JSON report created: ${filepath}`, this.metadata);
  }
}


import { Metadata } from "@superglue/shared";
import { writeFileSync } from "fs";
import { join } from "path";
import { logMessage } from "../../utils/logs.js";
import { WorkflowAttempt } from "./types.js";

export class JsonReporter {
  constructor(
    private baseDir: string,
    private metadata: Metadata
  ) {
  }

  public reportAttempts(timestamp: string, attempts: WorkflowAttempt[]): void {
    const filepath = join(this.baseDir, `results/agent-eval-${timestamp}.json` );

    const shortendAttempt = attempts.map(attempt => ({
      workflow: attempt.workflow?.id ?? 'undefined',
      buildError: attempt.buildError ?? null,
      executionError: attempt.executionError ?? null,
      data: attempt.result?.data ?? null,
    }));

    writeFileSync(filepath, JSON.stringify(shortendAttempt, null, 2), "utf-8");
    logMessage("info", `JSON report created: ${filepath}`, this.metadata);
  }
}


import { Metrics, WorkflowMetrics } from "../types.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { join, dirname } from "path";

export class CsvReporter {
  private resultsDir: string;

  constructor(
    private baseDir: string,
    private metadata: Metadata
  ) {
    this.resultsDir = join(baseDir, "data/results");
  }

  public report(timestamp: string, metrics: Metrics): string {
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
    }

    const filename = `agent-eval-${timestamp}.csv`;
    const filepath = join(this.resultsDir, filename);

    const csvContent = this.generateCsv(metrics);
    writeFileSync(filepath, csvContent, "utf-8");

    logMessage("info", `CSV report created: ${filepath}`, this.metadata);
    return filepath;
  }

  private generateCsv(metrics: Metrics): string {
    const headers = [
      "workflow_id",
      "workflow_name",
      "mode",
      "total_attempts",
      "total_successful_attempts",
      "total_failed_attempts",
      "has_one_shot_attempts",
      "has_self_healing_attempts",
      "had_one_shot_success",
      "had_self_healing_success",
      "success",
      "avg_build_time_ms",
      "avg_exec_time_ms",
      "failures_build",
      "failures_execution",
      "failures_strict_validation"
    ];

    const rows: string[] = [headers.join(",")];

    for (const workflow of metrics.workflowMetrics) {
      if (workflow.hasOneShotAttempts) {
        rows.push(this.workflowToRow(workflow, "one-shot"));
      }
      if (workflow.hasSelfHealingAttempts) {
        rows.push(this.workflowToRow(workflow, "self-healing"));
      }
    }

    return rows.join("\n");
  }

  private workflowToRow(workflow: WorkflowMetrics, mode: "one-shot" | "self-healing"): string {
    const isOneShot = mode === "one-shot";
    const success = isOneShot ? workflow.hadOneShotSuccess : workflow.hadSelfHealingSuccess;
    const avgBuildTime = workflow.averageBuildTimeMs;
    const avgExecTime = isOneShot ? workflow.oneShotAverageExecutionTimeMs : workflow.selfHealingAverageExecutionTimeMs;
    const failures = isOneShot ? workflow.oneShotFailuresByReason : workflow.selfHealingFailuresByReason;

    const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;

    return [
      escapeCsv(workflow.workflowId),
      escapeCsv(workflow.workflowName),
      mode,
      workflow.totalAttempts,
      workflow.totalSuccessfulAttempts,
      workflow.totalFailedAttempts,
      workflow.hasOneShotAttempts ? "true" : "false",
      workflow.hasSelfHealingAttempts ? "true" : "false",
      workflow.hadOneShotSuccess ? "true" : "false",
      workflow.hadSelfHealingSuccess ? "true" : "false",
      success ? "true" : "false",
      avgBuildTime?.toFixed(2) ?? "",
      avgExecTime?.toFixed(2) ?? "",
      failures.build,
      failures.execution,
      failures.strict_validation
    ].join(",");
  }
}


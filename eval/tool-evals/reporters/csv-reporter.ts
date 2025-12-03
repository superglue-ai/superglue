import { Metrics, ToolMetrics } from "../types.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { ServiceMetadata } from "@superglue/shared";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { join, dirname } from "path";

export class CsvReporter {
  private resultsDir: string;

  constructor(
    private baseDir: string,
    private metadata: ServiceMetadata
  ) {
    this.resultsDir = join(baseDir, "data/results");
  }

  public report(timestamp: string, metrics: Metrics): string {
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
    }

    const filename = `${timestamp}-tool-eval.csv`;
    const filepath = join(this.resultsDir, filename);

    const csvContent = this.generateCsv(metrics);
    writeFileSync(filepath, csvContent, "utf-8");

    logMessage("info", `CSV report created: ${filepath}`, this.metadata);
    return filepath;
  }

  private generateCsv(metrics: Metrics): string {
    const headers = [
      "tool_id",
      "tool_name",
      "mode",
      "success",
      "avg_build_time_ms",
      "avg_exec_time_ms"
    ];

    const rows: string[] = [headers.join(",")];

    for (const tool of metrics.toolMetrics) {
      if (tool.hasOneShotAttempts) {
        rows.push(this.toolToRow(tool, "one-shot"));
      }
      if (tool.hasSelfHealingAttempts) {
        rows.push(this.toolToRow(tool, "self-healing"));
      }
    }

    return rows.join("\n");
  }

  private toolToRow(tool: ToolMetrics, mode: "one-shot" | "self-healing"): string {
    const isOneShot = mode === "one-shot";
    const success = isOneShot ? tool.hadOneShotSuccess : tool.hadSelfHealingSuccess;
    const avgBuildTime = tool.averageBuildTimeMs;
    const avgExecTime = isOneShot ? tool.oneShotAverageExecutionTimeMs : tool.selfHealingAverageExecutionTimeMs;

    const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;

    return [
      escapeCsv(tool.toolId),
      escapeCsv(tool.toolName),
      mode,
      success ? "true" : "false",
      avgBuildTime?.toFixed(2) ?? "",
      avgExecTime?.toFixed(2) ?? ""
    ].join(",");
  }
}


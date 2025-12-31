import type { Metrics } from "../types.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "path";

export class ConsoleReporter {
  static report(metrics: Metrics, timestamp: string, baseDir: string): void {
    this.printHeader();
    this.printConfig();
    this.printMetrics(metrics);
    this.printUIInstructions(timestamp, baseDir);
    this.printFooter();
  }

  private static printHeader(): void {
    console.log("\n" + "═".repeat(80));
    console.log("  📊 EVALUATION RESULTS");
    console.log("═".repeat(80));
  }

  private static printFooter(): void {
    console.log("═".repeat(80) + "\n");
  }

  private static printConfig(): void {
    const llmProvider = process.env.LLM_PROVIDER || "not_set";
    const backendModel = this.getBackendModel(llmProvider);

    console.log(`\nLLM: ${llmProvider} / ${backendModel}\n`);
  }

  private static printMetrics(metrics: Metrics): void {
    const selfHealingAtLeastOneRate =
      metrics.toolSelfHealingSuccessRate !== null ? metrics.toolSelfHealingSuccessRate * 100 : null;
    const oneShotAtLeastOneRate =
      metrics.toolOneShotSuccessRate !== null ? metrics.toolOneShotSuccessRate * 100 : null;

    const oneShotAvgRate =
      metrics.toolOneShotAverageSuccessRate !== null
        ? metrics.toolOneShotAverageSuccessRate * 100
        : null;
    const selfHealingAvgRate =
      metrics.toolSelfHealingAverageSuccessRate !== null
        ? metrics.toolSelfHealingAverageSuccessRate * 100
        : null;

    const selfHealingSuccessCount = metrics.toolMetrics.filter(
      (t) => t.hadSelfHealingSuccess || t.hadOneShotSuccess,
    ).length;
    const oneShotSuccessCount = metrics.toolMetrics.filter((t) => t.hadOneShotSuccess).length;
    const toolCount = metrics.toolCount;

    if (oneShotAvgRate !== null || oneShotAtLeastOneRate !== null) {
      console.log(
        `One-Shot Avg Success: ${oneShotAvgRate !== null ? oneShotAvgRate.toFixed(1) + "%" : "N/A"}`,
      );
      if (oneShotAtLeastOneRate !== null) {
        console.log(
          `  At least one:       ${oneShotAtLeastOneRate.toFixed(1)}% (${oneShotSuccessCount}/${toolCount})`,
        );
      }
    }

    if (selfHealingAvgRate !== null || selfHealingAtLeastOneRate !== null) {
      console.log(
        `Self-Healing Avg:     ${selfHealingAvgRate !== null ? selfHealingAvgRate.toFixed(1) + "%" : "N/A"}`,
      );
      if (selfHealingAtLeastOneRate !== null) {
        console.log(
          `  At least one:       ${selfHealingAtLeastOneRate.toFixed(1)}% (${selfHealingSuccessCount}/${toolCount})`,
        );
      }
    }

    console.log("");
    console.log(`Avg Build Time:       ${(metrics.overallAverageBuildTimeMs / 1000).toFixed(1)}s`);

    if (metrics.oneShotAverageExecutionTimeMs !== null) {
      console.log(
        `Avg Exec (One-Shot):  ${(metrics.oneShotAverageExecutionTimeMs / 1000).toFixed(1)}s`,
      );
    }

    if (metrics.selfHealingAverageExecutionTimeMs !== null) {
      console.log(
        `Avg Exec (Healing):   ${(metrics.selfHealingAverageExecutionTimeMs / 1000).toFixed(1)}s`,
      );
    }
  }

  private static printUIInstructions(timestamp: string, baseDir: string): void {
    const htmlPath = join(baseDir, "ui/index.html");
    const absolutePath = htmlPath.startsWith("/") ? htmlPath : join(process.cwd(), htmlPath);
    const fileUrl = `file://${absolutePath}`;
    const jsonFilename = `${timestamp}-tool-eval.json`;

    console.log("\n📊 View detailed results in the UI:");
    console.log(`   ${fileUrl}`);
    console.log(`   Then load: ${jsonFilename}`);
  }

  private static getBackendModel(provider: string): string {
    const providerLower = provider.toLowerCase();

    switch (providerLower) {
      case "openai":
        return process.env.OPENAI_MODEL || "not_set";
      case "anthropic":
        return process.env.ANTHROPIC_MODEL || "not_set";
      case "gemini":
        return process.env.GEMINI_MODEL || "not_set";
      case "azure":
        return process.env.AZURE_MODEL || "not_set";
      default:
        return "not_set";
    }
  }
}

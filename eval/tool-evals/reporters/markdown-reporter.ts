import type { Metrics, ToolMetrics, MetricsComparisonResult, ToolMetricsComparisonResult, ToolAttempt, FailureCountsByReason } from "../types.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { join } from "path";

export class MarkdownReporter {
  private resultsDir: string;

  constructor(
    private baseDir: string,
    private metadata: Metadata
  ) {
    this.resultsDir = join(baseDir, "data/results");
  }

  public report(timestamp: string, metrics: Metrics, metricsComparison?: MetricsComparisonResult, attempts?: ToolAttempt[]): string {
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
    }

    const filename = `${timestamp}-tool-eval.md`;
    const filepath = join(this.resultsDir, filename);

    const markdownContent = this.generateMarkdown(metrics, metricsComparison, attempts);
    writeFileSync(filepath, markdownContent, "utf-8");

    logMessage("info", `Markdown report created: ${filepath}`, this.metadata);
    return filepath;
  }

  private generateMarkdown(metrics: Metrics, metricsComparison?: MetricsComparisonResult, attempts?: ToolAttempt[]): string {
    const sections: string[] = [];
    
    sections.push(this.generateHeader());
    sections.push(this.generateOverallMetrics(metrics, metricsComparison));
    sections.push(this.generateToolBreakdown(metrics, metricsComparison));
    sections.push(this.generateDeterminismSection(attempts ?? []));
    sections.push(this.generatePerformanceMetrics(metrics, metricsComparison));
    
    return sections.join('\n\n');
  }

  private generateHeader(): string {
    return '# 📊 Evaluation Results';
  }

  private generateOverallMetrics(metrics: Metrics, comparison?: MetricsComparisonResult): string {
    const selfHealingRate = metrics.toolSelfHealingSuccessRate !== null ? metrics.toolSelfHealingSuccessRate * 100 : null;
    const oneShotRate = metrics.toolOneShotSuccessRate !== null ? metrics.toolOneShotSuccessRate * 100 : null;
    
    let output = '## 📈 Overall Metrics\n\n';
    output += '| Metric | Current | vs Last | vs Benchmark |\n';
    output += '|--------|---------|---------|-------------|\n';

    if (selfHealingRate !== null) {
      const current = `${selfHealingRate.toFixed(1)}%`;
      const lastDiffVal = comparison?.lastRun.toolSelfHealingSuccessRateDifference;
      const benchDiffVal = comparison?.benchmark.toolSelfHealingSuccessRateDifference;
      const lastDiff = this.formatCompactDiff(lastDiffVal !== null && lastDiffVal !== undefined ? lastDiffVal * 100 : null);
      const benchDiff = this.formatCompactDiff(benchDiffVal !== null && benchDiffVal !== undefined ? benchDiffVal * 100 : null);
      output += `| 🔄 Self-Healing | ${current} | ${lastDiff} | ${benchDiff} |\n`;
    }

    if (oneShotRate !== null) {
      const current = `${oneShotRate.toFixed(1)}%`;
      const lastDiffVal = comparison?.lastRun.toolOneShotSuccessRateDifference;
      const benchDiffVal = comparison?.benchmark.toolOneShotSuccessRateDifference;
      const lastDiff = this.formatCompactDiff(lastDiffVal !== null && lastDiffVal !== undefined ? lastDiffVal * 100 : null);
      const benchDiff = this.formatCompactDiff(benchDiffVal !== null && benchDiffVal !== undefined ? benchDiffVal * 100 : null);
      output += `| 🎯 One-Shot | ${current} | ${lastDiff} | ${benchDiff} |\n`;
    }

    return output;
  }

  private generateDeterminismSection(attempts: ToolAttempt[]): string {
    let output = '## 🧪 Determinism\n\n';
    
    if (attempts.length === 0) {
      output += 'No attempts.\n';
      return output;
    }

    const byTool = new Map<string, ToolAttempt[]>();
    for (const a of attempts) {
      const id = a.toolConfig.id;
      if (!byTool.has(id)) byTool.set(id, []);
      byTool.get(id)!.push(a);
    }

    const nonDeterministicTools: string[] = [];
    for (const [id, items] of byTool.entries()) {
      const sh = items.filter(x => x.selfHealingEnabled);
      const os = items.filter(x => !x.selfHealingEnabled);
      
      const shSucc = sh.filter(x => x.executionSuccess).length;
      const shFail = sh.filter(x => !x.executionSuccess).length;
      const osSucc = os.filter(x => x.executionSuccess).length;
      const osFail = os.filter(x => !x.executionSuccess).length;
      
      const isNonDeterministic = (shSucc > 0 && shFail > 0) || (osSucc > 0 && osFail > 0);
      if (isNonDeterministic) {
        nonDeterministicTools.push(id);
      }
    }

    const totalTools = byTool.size;
    const deterministicCount = totalTools - nonDeterministicTools.length;
    
    output += `**${deterministicCount}/${totalTools}** tools deterministic`;
    
    if (nonDeterministicTools.length > 0) {
      output += ` (${nonDeterministicTools.length} non-deterministic)\n\n`;
      output += `**Non-deterministic tools:** ${nonDeterministicTools.join(', ')}\n`;
    } else {
      output += '\n';
    }
    
    return output;
  }

  private generatePerformanceMetrics(metrics: Metrics, comparison?: MetricsComparisonResult): string {
    let output = '## ⚡ Performance Metrics\n\n';
    
    const buildDiff = comparison ? this.formatTimeDiff(comparison.lastRun.overallAverageBuildTimeMsDifference) : '';
    output += `- 🏗️ Average Build Time: **${(metrics.overallAverageBuildTimeMs / 1000).toFixed(1)}s**${buildDiff}\n`;
    
    if (metrics.oneShotAverageExecutionTimeMs !== null) {
      const osExecDiff = comparison ? this.formatTimeDiff(comparison.lastRun.oneShotAverageExecutionTimeMsDifference) : '';
      output += `- 🎯 Average One-Shot Execution Time: **${(metrics.oneShotAverageExecutionTimeMs / 1000).toFixed(1)}s**${osExecDiff}\n`;
    }
    
    if (metrics.selfHealingAverageExecutionTimeMs !== null) {
      const shExecDiff = comparison ? this.formatTimeDiff(comparison.lastRun.selfHealingAverageExecutionTimeMsDifference) : '';
      output += `- 🔄 Average Self-Healing Exec Time: **${(metrics.selfHealingAverageExecutionTimeMs / 1000).toFixed(1)}s**${shExecDiff}\n`;
    }
    
    return output;
  }

  private generateToolBreakdown(metrics: Metrics, comparison?: MetricsComparisonResult): string {
    let output = '## 📋 Tool Breakdown\n\n';
    output += '| Tool | 1-Shot | Heal* | 1-Shot Failed At | Healing Failed At |\n';
    output += '|----------|--------|-------|------------------|-------------------|\n';
    
    const comparisonById = comparison 
      ? new Map(comparison.lastRun.toolMetrics.map(c => [c.toolId, c]))
      : undefined;
    
    const sortedTools = [...metrics.toolMetrics].sort((a, b) => 
      a.toolName.localeCompare(b.toolName)
    );
    
    for (const tool of sortedTools) {
      const toolComparison = comparisonById?.get(tool.toolId);
      output += this.generateToolRow(tool, toolComparison);
    }
    
    output += `\n**Total:** ${sortedTools.length} tools\n`;
    output += '*Self-healing only runs for tools that failed one-shot*\n';
    
    return output;
  }

  private generateToolRow(tool: ToolMetrics, comparison?: ToolMetricsComparisonResult): string {
    const oneShot = tool.hadOneShotSuccess ? '✅' : (tool.hasOneShotAttempts ? '❌' : ' ');
    const heal = tool.hadSelfHealingSuccess ? '✅' : (tool.hasSelfHealingAttempts ? '❌' : ' ');

    const arrow = (d: -1 | 0 | 1) => d > 0 ? '↗' : d < 0 ? '↘' : '';
    const oneShotDelta = comparison && comparison.oneShotSuccessChange !== 0 && tool.hasOneShotAttempts ? `${arrow(comparison.oneShotSuccessChange)}` : '';
    const healDelta = comparison && comparison.selfHealingSuccessChange !== 0 && tool.hasSelfHealingAttempts ? `${arrow(comparison.selfHealingSuccessChange)}` : '';

    const oneShotText = `${oneShot}${oneShotDelta}`;
    const healText = `${heal}${healDelta}`;

    const oneShotFailures = !tool.hadOneShotSuccess && tool.hasOneShotAttempts
      ? this.formatFailureReasons(tool.oneShotFailuresByReason)
      : '';
    const healingFailures = !tool.hadSelfHealingSuccess && tool.hasSelfHealingAttempts
      ? this.formatFailureReasons(tool.selfHealingFailuresByReason)
      : '';

    return `| ${tool.toolName} | ${oneShotText} | ${healText} | ${oneShotFailures} | ${healingFailures} |\n`;
  }

  private formatFailureReasons(failureCounts: FailureCountsByReason): string {
    const reasons: string[] = [];
    
    if (failureCounts.build > 0) reasons.push('Build');
    if (failureCounts.execution > 0) reasons.push('Execution');
    if (failureCounts.strict_validation > 0) reasons.push('Strict Validation');
    
    return reasons.join(', ');
  }

  private formatCompactDiff(diff?: number | null): string {
    if (diff === undefined || diff === null) return 'n/a';
    if (Math.abs(diff) < 0.1) return '0.0%';
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}%`;
  }

  private formatTimeDiff(diffMs: number | null): string {
    if (diffMs === null) return '';
    if (Math.abs(diffMs) < 100) return '';
    const sign = diffMs > 0 ? '+' : '';
    return ` (${sign}${(diffMs / 1000).toFixed(1)}s)`;
  }
}


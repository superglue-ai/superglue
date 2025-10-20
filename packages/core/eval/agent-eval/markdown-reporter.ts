import type { Metrics, WorkflowMetrics, MetricsComparisonResult, WorkflowMetricsComparisonResult, WorkflowAttempt, FailureCountsByReason } from "./types.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../../utils/logs.js";
import { join } from "path";

export class MarkdownReporter {
  private resultsDir: string;

  constructor(
    private baseDir: string,
    private metadata: Metadata
  ) {
    this.resultsDir = join(baseDir, "results");
  }

  public report(timestamp: string, metrics: Metrics, metricsComparison?: MetricsComparisonResult, attempts?: WorkflowAttempt[]): string {
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
    }

    const filename = `agent-eval-${timestamp}.md`;
    const filepath = join(this.resultsDir, filename);

    const markdownContent = this.generateMarkdown(metrics, metricsComparison, attempts);
    writeFileSync(filepath, markdownContent, "utf-8");

    logMessage("info", `Markdown report created: ${filepath}`, this.metadata);
    return filepath;
  }

  private generateMarkdown(metrics: Metrics, metricsComparison?: MetricsComparisonResult, attempts?: WorkflowAttempt[]): string {
    const sections: string[] = [];
    
    sections.push(this.generateHeader());
    sections.push(this.generateOverallMetrics(metrics, metricsComparison));
    sections.push(this.generateWorkflowBreakdown(metrics, metricsComparison));
    sections.push(this.generateDeterminismSection(attempts ?? []));
    sections.push(this.generatePerformanceMetrics(metrics, metricsComparison));
    
    return sections.join('\n\n');
  }

  private generateHeader(): string {
    return '# 📊 Evaluation Results';
  }

  private generateOverallMetrics(metrics: Metrics, comparison?: MetricsComparisonResult): string {
    const selfHealingRate = metrics.workflowSelfHealingSuccessRate !== null ? metrics.workflowSelfHealingSuccessRate * 100 : null;
    const oneShotRate = metrics.workflowOneShotSuccessRate !== null ? metrics.workflowOneShotSuccessRate * 100 : null;
    
    let output = '## 📈 Overall Metrics\n\n';
    output += '| Metric | Current | vs Last | vs Benchmark |\n';
    output += '|--------|---------|---------|-------------|\n';

    if (selfHealingRate !== null) {
      const current = `${selfHealingRate.toFixed(1)}%`;
      const lastDiffVal = comparison?.lastRun.workflowSelfHealingSuccessRateDifference;
      const benchDiffVal = comparison?.benchmark.workflowSelfHealingSuccessRateDifference;
      const lastDiff = this.formatCompactDiff(lastDiffVal !== null && lastDiffVal !== undefined ? lastDiffVal * 100 : null);
      const benchDiff = this.formatCompactDiff(benchDiffVal !== null && benchDiffVal !== undefined ? benchDiffVal * 100 : null);
      output += `| 🔄 Self-Healing | ${current} | ${lastDiff} | ${benchDiff} |\n`;
    }

    if (oneShotRate !== null) {
      const current = `${oneShotRate.toFixed(1)}%`;
      const lastDiffVal = comparison?.lastRun.workflowOneShotSuccessRateDifference;
      const benchDiffVal = comparison?.benchmark.workflowOneShotSuccessRateDifference;
      const lastDiff = this.formatCompactDiff(lastDiffVal !== null && lastDiffVal !== undefined ? lastDiffVal * 100 : null);
      const benchDiff = this.formatCompactDiff(benchDiffVal !== null && benchDiffVal !== undefined ? benchDiffVal * 100 : null);
      output += `| 🎯 One-Shot | ${current} | ${lastDiff} | ${benchDiff} |\n`;
    }

    return output;
  }

  private generateDeterminismSection(attempts: WorkflowAttempt[]): string {
    let output = '## 🧪 Determinism\n\n';
    
    if (attempts.length === 0) {
      output += 'No attempts.\n';
      return output;
    }

    const byWorkflow = new Map<string, WorkflowAttempt[]>();
    for (const a of attempts) {
      const id = a.workflowConfig.id;
      if (!byWorkflow.has(id)) byWorkflow.set(id, []);
      byWorkflow.get(id)!.push(a);
    }

    const nonDeterministicWorkflows: string[] = [];
    for (const [id, items] of byWorkflow.entries()) {
      const sh = items.filter(x => x.selfHealingEnabled);
      const os = items.filter(x => !x.selfHealingEnabled);
      
      const shSucc = sh.filter(x => x.executionSuccess).length;
      const shFail = sh.filter(x => !x.executionSuccess).length;
      const osSucc = os.filter(x => x.executionSuccess).length;
      const osFail = os.filter(x => !x.executionSuccess).length;
      
      const isNonDeterministic = (shSucc > 0 && shFail > 0) || (osSucc > 0 && osFail > 0);
      if (isNonDeterministic) {
        nonDeterministicWorkflows.push(id);
      }
    }

    const totalWorkflows = byWorkflow.size;
    const deterministicCount = totalWorkflows - nonDeterministicWorkflows.length;
    
    output += `**${deterministicCount}/${totalWorkflows}** workflows deterministic`;
    
    if (nonDeterministicWorkflows.length > 0) {
      output += ` (${nonDeterministicWorkflows.length} non-deterministic)\n\n`;
      output += `**Non-deterministic workflows:** ${nonDeterministicWorkflows.join(', ')}\n`;
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

  private generateWorkflowBreakdown(metrics: Metrics, comparison?: MetricsComparisonResult): string {
    let output = '## 📋 Workflow Breakdown\n\n';
    output += '| Workflow | 1-Shot | Heal* | 1-Shot Failed At | Healing Failed At |\n';
    output += '|----------|--------|-------|------------------|-------------------|\n';
    
    const comparisonById = comparison 
      ? new Map(comparison.lastRun.workflowMetrics.map(c => [c.workflowId, c]))
      : undefined;
    
    const sortedWorkflows = [...metrics.workflowMetrics].sort((a, b) => 
      a.workflowName.localeCompare(b.workflowName)
    );
    
    for (const workflow of sortedWorkflows) {
      const workflowComparison = comparisonById?.get(workflow.workflowId);
      output += this.generateWorkflowRow(workflow, workflowComparison);
    }
    
    output += `\n**Total:** ${sortedWorkflows.length} workflows\n`;
    output += '*Self-healing only runs for workflows that failed one-shot*\n';
    
    return output;
  }

  private generateWorkflowRow(workflow: WorkflowMetrics, comparison?: WorkflowMetricsComparisonResult): string {
    const oneShot = workflow.hadOneShotSuccess ? '✅' : (workflow.hasOneShotAttempts ? '❌' : ' ');
    const heal = workflow.hadSelfHealingSuccess ? '✅' : (workflow.hasSelfHealingAttempts ? '❌' : ' ');

    const arrow = (d: -1 | 0 | 1) => d > 0 ? '↗' : d < 0 ? '↘' : '';
    const oneShotDelta = comparison && comparison.oneShotSuccessChange !== 0 && workflow.hasOneShotAttempts ? `${arrow(comparison.oneShotSuccessChange)}` : '';
    const healDelta = comparison && comparison.selfHealingSuccessChange !== 0 && workflow.hasSelfHealingAttempts ? `${arrow(comparison.selfHealingSuccessChange)}` : '';

    const oneShotText = `${oneShot}${oneShotDelta}`;
    const healText = `${heal}${healDelta}`;

    const oneShotFailures = !workflow.hadOneShotSuccess && workflow.hasOneShotAttempts
      ? this.formatFailureReasons(workflow.oneShotFailuresByReason)
      : '';
    const healingFailures = !workflow.hadSelfHealingSuccess && workflow.hasSelfHealingAttempts
      ? this.formatFailureReasons(workflow.selfHealingFailuresByReason)
      : '';

    return `| ${workflow.workflowName} | ${oneShotText} | ${healText} | ${oneShotFailures} | ${healingFailures} |\n`;
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


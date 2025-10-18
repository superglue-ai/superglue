import type { Metrics, WorkflowMetrics, MetricsComparisonResult, WorkflowMetricsComparisonResult, WorkflowAttempt } from "./types.js";

export class ConsoleReporter {
  static report(metrics: Metrics, metricsComparison?: MetricsComparisonResult, attempts?: WorkflowAttempt[]): void {
    this.printHeader();
    this.printOverallMetrics(metrics, metricsComparison);
    this.printWorkflowBreakdown(metrics, metricsComparison);
    this.printDeterminismSection(attempts ?? []);
    this.printPerformanceMetrics(metrics, metricsComparison);
    this.printFooter();
  }

  private static printHeader(): void {
    console.log('\n' + '═'.repeat(80));
    console.log('  📊 EVALUATION RESULTS');
    console.log('═'.repeat(80));
  }

  private static printFooter(): void {
    console.log('═'.repeat(80) + '\n');
  }

  private static printOverallMetrics(metrics: Metrics, comparison?: MetricsComparisonResult): void {
    const workflowRate = metrics.workflowSuccessRate * 100;
    const selfHealingRate = metrics.workflowSelfHealingSuccessRate !== null ? metrics.workflowSelfHealingSuccessRate * 100 : null;
    const oneShotRate = metrics.workflowOneShotSuccessRate !== null ? metrics.workflowOneShotSuccessRate * 100 : null;
    
    const statusIcon = workflowRate >= 80 ? '✅' : workflowRate >= 50 ? '⚠️' : '❌';
    
    console.log('\n📈 OVERALL METRICS');
    console.log('─'.repeat(80));
    
    const workflowDiff = comparison ? this.formatDiff(comparison.workflowSuccessRateDifference * 100) : '';

    const workflowCountDisplay = `(${metrics.successfulWorkflowCount}/${metrics.workflowCount})`;
    console.log(`  ${statusIcon} Workflow Success Rate:        ${workflowRate.toFixed(1)}%${workflowDiff} ${workflowCountDisplay}`);

    if (selfHealingRate !== null) {
      const selfHealingDiff = comparison ? this.formatDiff(comparison.workflowSelfHealingSuccessRateDifference * 100) : '';
      console.log(`  🔄 Self-Healing:                   ${selfHealingRate.toFixed(1)}%${selfHealingDiff}`);
    }
    if (oneShotRate !== null) {
      const oneShotDiff = comparison ? this.formatDiff(comparison.workflowOneShotSuccessRateDifference * 100) : '';
      console.log(`  🎯 One-Shot Workflows:            ${oneShotRate.toFixed(1)}%${oneShotDiff}`);
    }
  }

  private static printDeterminismSection(attempts: WorkflowAttempt[]): void {
    console.log('\n🧪 DETERMINISM');
    console.log('─'.repeat(80));
    
    if (attempts.length === 0) {
      console.log('  No attempts.');
      return;
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
    
    console.log(`  ${deterministicCount}/${totalWorkflows} workflows deterministic${nonDeterministicWorkflows.length > 0 ? ` (${nonDeterministicWorkflows.length} non-deterministic)` : ''}`);
    
    if (nonDeterministicWorkflows.length > 0) {
      console.log(`    Non-deterministic: ${nonDeterministicWorkflows.join(', ')}`);
    }
  }


  private static printPerformanceMetrics(metrics: Metrics, comparison?: MetricsComparisonResult): void {
    const buildTime = metrics.overallAverageBuildTimeMs;
    const execTime = metrics.overallAverageExecutionTimeMs;
    
    const buildDiff = comparison ? this.formatTimeDiff(comparison.overallAverageBuildTimeMsDifference) : '';
    const execDiff = comparison ? this.formatTimeDiff(comparison.overallAverageExecutionTimeMsDifference) : '';
    
    console.log('\n⚡ PERFORMANCE METRICS');
    console.log('─'.repeat(80));
    console.log(`  🏗️  Average Build Time:            ${(buildTime / 1000).toFixed(1)}s${buildDiff}`);
    console.log(`  🚀 Average Execution Time:        ${(execTime / 1000).toFixed(1)}s${execDiff}`);
  }

  // removed failure analysis and detailed metrics for simplicity

  private static printWorkflowBreakdown(metrics: Metrics, comparison?: MetricsComparisonResult): void {
    console.log('\n📋 WORKFLOW BREAKDOWN');
    console.log('─'.repeat(80));
    const NAME_WIDTH = 40;
    const COL_WIDTH = 10;
    const header = `  ${'Workflow'.padEnd(NAME_WIDTH)} ${'1-Shot'.padEnd(COL_WIDTH)}${'Heal*'.padEnd(COL_WIDTH)}`;
    console.log(header);
    console.log('  ' + '─'.repeat(78));
    
    const comparisonById = comparison 
      ? new Map(comparison.workflowMetrics.map(c => [c.workflowId, c]))
      : undefined;
    
    for (const workflow of metrics.workflowMetrics) {
      const workflowComparison = comparisonById?.get(workflow.workflowId);
      this.printWorkflowRow(workflow, workflowComparison);
      this.printFailureSummaries(workflow);
    }
    
    console.log('  ' + '─'.repeat(78));
    console.log(`  Total: ${metrics.workflowMetrics.length} workflows`);
    console.log('  * Self-healing only runs for workflows that failed one-shot');
  }

  private static printWorkflowRow(workflow: WorkflowMetrics, comparison?: WorkflowMetricsComparisonResult): void {
    const NAME_WIDTH = 40;
    const COL_WIDTH = 10;
    const label = `${workflow.workflowId}`;
    const display = label.length > NAME_WIDTH 
      ? label.substring(0, NAME_WIDTH - 3) + '...'
      : label;
    const paddedName = display.padEnd(NAME_WIDTH);

    const oneShot = workflow.hadOneShotSuccess ? '✅' : (workflow.hasOneShotAttempts ? '❌' : '·');
    const heal = workflow.hadSelfHealingSuccess ? '✅' : (workflow.hasSelfHealingAttempts ? '❌' : '·');

    const arrow = (d: -1 | 0 | 1) => d > 0 ? '↗' : d < 0 ? '↘' : '';
    const oneShotDelta = comparison && comparison.oneShotSuccessChange !== 0 && workflow.hasOneShotAttempts ? `(${arrow(comparison.oneShotSuccessChange)})` : '';
    const healDelta = comparison && comparison.selfHealingSuccessChange !== 0 && workflow.hasSelfHealingAttempts ? `(${arrow(comparison.selfHealingSuccessChange)})` : '';

    const oneShotCol = `${oneShot}${oneShotDelta}`.padEnd(COL_WIDTH);
    const healCol = `${heal}${healDelta}`.padEnd(COL_WIDTH);

    console.log(`  ${paddedName} ${oneShotCol}${healCol}`);
  }

  private static printFailureSummaries(workflow: WorkflowMetrics): void {
    const os = workflow.oneShotFailuresByReason;
    const sh = workflow.selfHealingFailuresByReason;

    const format = (label: string, counts?: { build?: number; execution?: number; strict_validation?: number }): string | undefined => {
      if (!counts) return undefined;
      const b = counts.build ?? 0;
      const e = counts.execution ?? 0;
      const v = counts.strict_validation ?? 0;
      const total = b + e + v;
      if (total === 0) return undefined;
      const parts: string[] = [];
      if (b > 0) parts.push(`Build:${b}`);
      if (e > 0) parts.push(`Execution:${e}`);
      if (v > 0) parts.push(`Strict Validation:${v}`);
      if (parts.length === 1) {
        return `    ${label} ${parts[0]}`;
      }
      return `    ${label}: ${parts.join(', ')}`;
    };

    const osLine = format('Failed One-Shot', os as any);
    const shLine = format('Failed Healing', sh as any);
    if (osLine) console.log(osLine);
    if (shLine) console.log(shLine);
  }

  private static formatDiff(diff: number): string {
    if (Math.abs(diff) < 0.1) return '';
    const sign = diff > 0 ? '+' : '';
    return ` (${sign}${diff.toFixed(1)}%)`;
  }

  private static formatTimeDiff(diffMs: number): string {
    if (Math.abs(diffMs) < 100) return '';
    const sign = diffMs > 0 ? '+' : '';
    return ` (${sign}${(diffMs / 1000).toFixed(1)}s)`;
  }
}

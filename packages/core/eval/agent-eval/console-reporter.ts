import type { Metrics, WorkflowMetrics, MetricsComparisonResult, WorkflowMetricsComparisonResult, WorkflowAttempt } from "./types.js";

export class ConsoleReporter {
  static report(metrics: Metrics, metricsComparison?: MetricsComparisonResult, attempts?: WorkflowAttempt[]): void {
    this.printHeader();
    this.printOverallMetrics(metrics, metricsComparison);
    this.printWorkflowBreakdown(metrics, metricsComparison);
    this.printAttemptsSection(metrics, attempts ?? []);
    this.printPerformanceMetrics(metrics, metricsComparison);
    this.printFooter();
  }

  private static printHeader(): void {
    console.log('\n' + '═'.repeat(80));
    console.log('  📊 AGENT EVALUATION RESULTS');
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
      console.log(`  🔄 Self-Healing Workflows:        ${selfHealingRate.toFixed(1)}%${selfHealingDiff}`);
    }
    if (oneShotRate !== null) {
      const oneShotDiff = comparison ? this.formatDiff(comparison.workflowOneShotSuccessRateDifference * 100) : '';
      console.log(`  🎯 One-Shot Workflows:            ${oneShotRate.toFixed(1)}%${oneShotDiff}`);
    }
  }

  private static printAttemptsSection(metrics: Metrics, attempts: WorkflowAttempt[]): void {
    console.log('\n🧪 ATTEMPTS');
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

    for (const metricsRow of metrics.workflowMetrics) {
      const id = metricsRow.workflowId;
      const items = byWorkflow.get(id) ?? [];
      const sh = items.filter(x => x.selfHealingEnabled);
      const os = items.filter(x => !x.selfHealingEnabled);
      const shSucc = sh.filter(x => x.executionSuccess).length;
      const shFail = sh.filter(x => !x.executionSuccess).length;
      const osSucc = os.filter(x => x.executionSuccess).length;
      const osFail = os.filter(x => !x.executionSuccess).length;
      const shVar = shSucc > 0 && shFail > 0 ? ' (non-deterministic)' : '';
      const osVar = osSucc > 0 && osFail > 0 ? ' (non-deterministic)' : '';

      console.log(`  ${id}`);
      if (sh.length > 0) console.log(`    SH: success ${shSucc}, fail ${shFail}${shVar}`);
      if (os.length > 0) console.log(`    OS: success ${osSucc}, fail ${osFail}${osVar}`);
    }
  }

  private static printPerformanceMetrics(metrics: Metrics, comparison?: MetricsComparisonResult): void {
    const buildTime = metrics.overallAverageBuildTimeMs;
    const execTime = metrics.overallAverageExecutionTimeMs;
    
    const buildDiff = comparison ? this.formatTimeDiff(comparison.overallAverageBuildTimeMsDifference) : '';
    const execDiff = comparison ? this.formatTimeDiff(comparison.overallAverageExecutionTimeMsDifference) : '';
    
    console.log('\n⚡ PERFORMANCE METRICS');
    console.log('─'.repeat(80));
    console.log(`  🏗️  Average Build Time:            ${buildTime.toFixed(0)}ms${buildDiff}`);
    console.log(`  🚀 Average Execution Time:        ${execTime.toFixed(0)}ms${execDiff}`);
  }

  // removed failure analysis and detailed metrics for simplicity

  private static printWorkflowBreakdown(metrics: Metrics, comparison?: MetricsComparisonResult): void {
    console.log('\n📋 WORKFLOW BREAKDOWN');
    console.log('─'.repeat(80));
    const NAME_WIDTH = 40;
    const COL_WIDTH = 10;
    const header = `  ${'Workflow'.padEnd(NAME_WIDTH)} ${'Any'.padEnd(COL_WIDTH)}${'1-Shot'.padEnd(COL_WIDTH)}${'Heal'.padEnd(COL_WIDTH)}`;
    console.log(header);
    console.log('  ' + '─'.repeat(78));
    
    const sortedWorkflows = [...metrics.workflowMetrics].sort((a, b) => {
      const rateA = a.totalAttempts > 0 ? a.totalSuccessfulAttempts / a.totalAttempts : 0;
      const rateB = b.totalAttempts > 0 ? b.totalSuccessfulAttempts / b.totalAttempts : 0;
      return rateB - rateA;
    });
    
    const comparisonById = comparison 
      ? new Map(comparison.workflowMetrics.map(c => [c.workflowId, c]))
      : undefined;
    
    for (const workflow of sortedWorkflows) {
      const workflowComparison = comparisonById?.get(workflow.workflowId);
      this.printWorkflowRow(workflow, workflowComparison);
      this.printFailureSummaries(workflow);
    }
    
    console.log('  ' + '─'.repeat(78));
    console.log(`  Total: ${metrics.workflowMetrics.length} workflows`);
  }

  private static printWorkflowRow(workflow: WorkflowMetrics, comparison?: WorkflowMetricsComparisonResult): void {
    const NAME_WIDTH = 40;
    const COL_WIDTH = 10;
    const label = `${workflow.workflowId}`;
    const display = label.length > NAME_WIDTH 
      ? label.substring(0, NAME_WIDTH - 3) + '...'
      : label;
    const paddedName = display.padEnd(NAME_WIDTH);

    const any = workflow.hadAnySuccess ? '✅' : '❌';
    const oneShot = workflow.hadOneShotSuccess ? '✅' : (workflow.hasOneShotAttempts ? '❌' : '·');
    const heal = workflow.hadSelfHealingSuccess ? '✅' : (workflow.hasSelfHealingAttempts ? '❌' : '·');

    const arrow = (d: -1 | 0 | 1) => d > 0 ? '↗' : d < 0 ? '↘' : '';
    const anyDelta = comparison && comparison.anySuccessChange !== 0 ? `(${arrow(comparison.anySuccessChange)})` : '';
    const oneShotDelta = comparison && comparison.oneShotSuccessChange !== 0 ? `(${arrow(comparison.oneShotSuccessChange)})` : '';
    const healDelta = comparison && comparison.selfHealingSuccessChange !== 0 ? `(${arrow(comparison.selfHealingSuccessChange)})` : '';

    const anyCol = `${any}${anyDelta}`.padEnd(COL_WIDTH);
    const oneShotCol = `${oneShot}${oneShotDelta}`.padEnd(COL_WIDTH);
    const healCol = `${heal}${healDelta}`.padEnd(COL_WIDTH);

    console.log(`  ${paddedName} ${anyCol}${oneShotCol}${healCol}`);
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
    if (Math.abs(diffMs) < 10) return '';
    const sign = diffMs > 0 ? '+' : '';
    return ` (${sign}${diffMs.toFixed(0)}ms)`;
  }
}

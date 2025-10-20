import type { Metrics, WorkflowMetrics, MetricsComparisonResult, WorkflowMetricsComparisonResult, WorkflowAttempt, FailureCountsByReason } from "./types.js";

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
    const selfHealingRate = metrics.workflowSelfHealingSuccessRate !== null ? metrics.workflowSelfHealingSuccessRate * 100 : null;
    const oneShotRate = metrics.workflowOneShotSuccessRate !== null ? metrics.workflowOneShotSuccessRate * 100 : null;
    
    console.log('\n📈 OVERALL METRICS');
    
    const METRIC_WIDTH = 20;
    const COL_WIDTH = 12;
    const tableWidth = 2 + METRIC_WIDTH + 1 + COL_WIDTH + 1 + COL_WIDTH + 1 + COL_WIDTH;
    
    console.log('─'.repeat(tableWidth));
    const header = `  ${'Metric'.padEnd(METRIC_WIDTH)}│${'Current'.padEnd(COL_WIDTH)}│${'vs Last'.padEnd(COL_WIDTH)}│${'vs Benchmark'.padEnd(COL_WIDTH)}`;
    console.log(header);
    const separator = '  ' + '─'.repeat(METRIC_WIDTH) + '┼' + '─'.repeat(COL_WIDTH) + '┼' + '─'.repeat(COL_WIDTH) + '┼' + '─'.repeat(COL_WIDTH);
    console.log(separator);

    if (selfHealingRate !== null) {
      const current = (selfHealingRate.toFixed(1) + '%').padEnd(COL_WIDTH);
      const lastDiffVal = comparison?.lastRun.workflowSelfHealingSuccessRateDifference;
      const benchDiffVal = comparison?.benchmark.workflowSelfHealingSuccessRateDifference;
      const lastDiff = this.formatCompactDiff(lastDiffVal !== null && lastDiffVal !== undefined ? lastDiffVal * 100 : null).padEnd(COL_WIDTH);
      const benchDiff = this.formatCompactDiff(benchDiffVal !== null && benchDiffVal !== undefined ? benchDiffVal * 100 : null).padEnd(COL_WIDTH);
      console.log(`  ${'🔄 Self-Healing'.padEnd(METRIC_WIDTH)}│${current}│${lastDiff}│${benchDiff}`);
      console.log(separator);
    }

    if (oneShotRate !== null) {
      const current = (oneShotRate.toFixed(1) + '%').padEnd(COL_WIDTH);
      const lastDiffVal = comparison?.lastRun.workflowOneShotSuccessRateDifference;
      const benchDiffVal = comparison?.benchmark.workflowOneShotSuccessRateDifference;
      const lastDiff = this.formatCompactDiff(lastDiffVal !== null && lastDiffVal !== undefined ? lastDiffVal * 100 : null).padEnd(COL_WIDTH);
      const benchDiff = this.formatCompactDiff(benchDiffVal !== null && benchDiffVal !== undefined ? benchDiffVal * 100 : null).padEnd(COL_WIDTH);
      console.log(`  ${'🎯 One-Shot'.padEnd(METRIC_WIDTH)}│${current}│${lastDiff}│${benchDiff}`);
      console.log(separator);
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
    console.log('\n⚡ PERFORMANCE METRICS');
    console.log('─'.repeat(80));
    
    const buildDiff = comparison ? this.formatTimeDiff(comparison.lastRun.overallAverageBuildTimeMsDifference) : '';
    console.log(`  🏗️  Average Build Time:               ${(metrics.overallAverageBuildTimeMs / 1000).toFixed(1)}s${buildDiff}`);
    
    if (metrics.oneShotAverageExecutionTimeMs !== null) {
      const osExecDiff = comparison ? this.formatTimeDiff(comparison.lastRun.oneShotAverageExecutionTimeMsDifference) : '';
      console.log(`  🎯 Average One-Shot Execution Time:  ${(metrics.oneShotAverageExecutionTimeMs / 1000).toFixed(1)}s${osExecDiff}`);
    }
    
    if (metrics.selfHealingAverageExecutionTimeMs !== null) {
      const shExecDiff = comparison ? this.formatTimeDiff(comparison.lastRun.selfHealingAverageExecutionTimeMsDifference) : '';
      console.log(`  🔄 Average Self-Healing Exec Time:   ${(metrics.selfHealingAverageExecutionTimeMs / 1000).toFixed(1)}s${shExecDiff}`);
    }
  }

  private static printWorkflowBreakdown(metrics: Metrics, comparison?: MetricsComparisonResult): void {
    console.log('\n📋 WORKFLOW BREAKDOWN');
    const NAME_WIDTH = 45;
    const COL_WIDTH = 10;
    const FAIL_WIDTH = 35;
    const tableWidth = 2 + NAME_WIDTH + 1 + COL_WIDTH + 1 + COL_WIDTH + 1 + FAIL_WIDTH + 1 + FAIL_WIDTH;
    console.log('─'.repeat(tableWidth));
    const header = `  ${'Workflow'.padEnd(NAME_WIDTH)}│${'1-Shot'.padEnd(COL_WIDTH)}│${'Heal*'.padEnd(COL_WIDTH)}│${'1-Shot Failed At'.padEnd(FAIL_WIDTH)}│${'Healing Failed At'.padEnd(FAIL_WIDTH)}`;
    console.log(header);
    const separator = '  ' + '─'.repeat(NAME_WIDTH) + '┼' + '─'.repeat(COL_WIDTH) + '┼' + '─'.repeat(COL_WIDTH) + '┼' + '─'.repeat(FAIL_WIDTH) + '┼' + '─'.repeat(FAIL_WIDTH);
    console.log(separator);
    
    const comparisonById = comparison 
      ? new Map(comparison.lastRun.workflowMetrics.map(c => [c.workflowId, c]))
      : undefined;
    
    const sortedWorkflows = [...metrics.workflowMetrics].sort((a, b) => 
      a.workflowName.localeCompare(b.workflowName)
    );
    
    for (let i = 0; i < sortedWorkflows.length; i++) {
      const workflow = sortedWorkflows[i];
      const workflowComparison = comparisonById?.get(workflow.workflowId);
      this.printWorkflowRow(workflow, workflowComparison);
      
      if (i < sortedWorkflows.length - 1) {
        console.log(separator);
      }
    }
    
    console.log(separator);
    console.log(`  Total: ${sortedWorkflows.length} workflows`);
    console.log('  * Self-healing only runs for workflows that failed one-shot');
  }

  private static printWorkflowRow(workflow: WorkflowMetrics, comparison?: WorkflowMetricsComparisonResult): void {
    const NAME_WIDTH = 45;
    const COL_WIDTH = 10;
    const FAIL_WIDTH = 35;
    const label = `${workflow.workflowName}`;
    const paddedName = label.padEnd(NAME_WIDTH);

    const oneShot = workflow.hadOneShotSuccess ? '✅' : (workflow.hasOneShotAttempts ? '❌' : ' ');
    const heal = workflow.hadSelfHealingSuccess ? '✅' : (workflow.hasSelfHealingAttempts ? '❌' : ' ');

    const arrow = (d: -1 | 0 | 1) => d > 0 ? '↗' : d < 0 ? '↘' : '';
    const oneShotDelta = comparison && comparison.oneShotSuccessChange !== 0 && workflow.hasOneShotAttempts ? `(${arrow(comparison.oneShotSuccessChange)})` : '';
    const healDelta = comparison && comparison.selfHealingSuccessChange !== 0 && workflow.hasSelfHealingAttempts ? `(${arrow(comparison.selfHealingSuccessChange)})` : '';

    // Emojis display as 2 chars wide in terminal, so pad less
    const oneShotText = `${oneShot}${oneShotDelta}`;
    const healText = `${heal}${healDelta}`;
    const oneShotVisualWidth = oneShotText.length + (oneShot !== ' ' ? 1 : 0); // +1 for emoji
    const healVisualWidth = healText.length + (heal !== ' ' ? 1 : 0); // +1 for emoji
    const oneShotCol = oneShotText + ' '.repeat(Math.max(0, COL_WIDTH - oneShotVisualWidth));
    const healCol = healText + ' '.repeat(Math.max(0, COL_WIDTH - healVisualWidth));

    const oneShotFailures = !workflow.hadOneShotSuccess && workflow.hasOneShotAttempts
      ? this.formatFailureReasons(workflow.oneShotFailuresByReason)
      : '';
    const healingFailures = !workflow.hadSelfHealingSuccess && workflow.hasSelfHealingAttempts
      ? this.formatFailureReasons(workflow.selfHealingFailuresByReason)
      : '';

    const oneShotFailsCol = oneShotFailures.padEnd(FAIL_WIDTH);
    const healingFailsCol = healingFailures.padEnd(FAIL_WIDTH);

    console.log(`  ${paddedName}│${oneShotCol}│${healCol}│${oneShotFailsCol}│${healingFailsCol}`);
  }

  private static formatFailureReasons(failureCounts: FailureCountsByReason): string {
    const reasons: string[] = [];
    
    if (failureCounts.build > 0) reasons.push('Build');
    if (failureCounts.execution > 0) reasons.push('Execution');
    if (failureCounts.strict_validation > 0) reasons.push('Strict Validation');
    
    return reasons.join(', ');
  }

  private static formatDiff(diff: number): string {
    if (Math.abs(diff) < 0.1) return '';
    const sign = diff > 0 ? '+' : '';
    return ` (${sign}${diff.toFixed(1)}%)`;
  }

  private static formatCompactDiff(diff?: number | null): string {
    if (diff === undefined || diff === null) return 'n/a';
    if (Math.abs(diff) < 0.1) return '0.0%';
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}%`;
  }

  private static formatTimeDiff(diffMs: number | null): string {
    if (diffMs === null) return '';
    if (Math.abs(diffMs) < 100) return '';
    const sign = diffMs > 0 ? '+' : '';
    return ` (${sign}${(diffMs / 1000).toFixed(1)}s)`;
  }
}

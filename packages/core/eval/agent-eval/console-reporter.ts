import { Metrics, WorkflowMetrics } from "./types.js";
import { WorkflowFailureReason } from "./types.js";

export class ConsoleReporter {
  static report(metrics: Metrics): void {
    this.printHeader();
    this.printOverallMetrics(metrics);
    this.printPerformanceMetrics(metrics);
    this.printFailureAnalysis(metrics);
    this.printDetailedMetrics(metrics);
    this.printWorkflowBreakdown(metrics);
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

  private static printOverallMetrics(metrics: Metrics): void {
    const overallRate = metrics.overallSuccessRate * 100;
    const workflowRate = metrics.workflowSuccessRate * 100;
    const selfHealingRate = metrics.overallSelfHealingSuccessRate * 100;
    const oneShotRate = metrics.overallOneShotSuccessRate * 100;
    
    const icon = overallRate >= 80 ? '✅' : overallRate >= 50 ? '⚠️' : '❌';
    
    console.log('\n🎯 SUCCESS METRICS');
    console.log('─'.repeat(80));
    console.log(`  ${icon} Overall Success Rate:          ${overallRate.toFixed(1)}% (${metrics.totalSuccessfulAttempts}/${metrics.totalAttempts} attempts)`);
    console.log(`  ${icon} Workflow-Level Success Rate:   ${workflowRate.toFixed(1)}% (workflows with ≥1 success)`);
    
    if (!isNaN(selfHealingRate) && !isNaN(oneShotRate)) {
      console.log(`\n  🔄 Self-Healing Mode:             ${selfHealingRate.toFixed(1)}%`);
      console.log(`  🎯 One-Shot Mode:                 ${oneShotRate.toFixed(1)}%`);
      
      const improvement = selfHealingRate - oneShotRate;
      if (improvement > 0) {
        console.log(`  📈 Self-Healing Improvement:      +${improvement.toFixed(1)}%`);
      } else if (improvement < 0) {
        console.log(`  📉 Self-Healing Regression:       ${improvement.toFixed(1)}%`);
      }
    }
  }

  private static printPerformanceMetrics(metrics: Metrics): void {
    const buildTime = metrics.overallAverageBuildTimeMs;
    const execTime = metrics.overallAverageExecutionTimeMs;
    const totalTime = buildTime + execTime;
    const buildPercent = (buildTime / totalTime) * 100;
    const execPercent = (execTime / totalTime) * 100;
    
    console.log('\n⚡ PERFORMANCE METRICS');
    console.log('─'.repeat(80));
    console.log(`  🏗️  Average Build Time:            ${buildTime.toFixed(0)}ms`);
    console.log(`  🚀 Average Execution Time:        ${execTime.toFixed(0)}ms`);
    console.log(`  ⏱️  Total Average Time:            ${totalTime.toFixed(0)}ms`);
    
    console.log('\n  Time Distribution:');
    const buildBars = Math.round(buildPercent / 2.5);
    const execBars = Math.round(execPercent / 2.5);
    console.log(`    Build:     [${'█'.repeat(buildBars)}${' '.repeat(40 - buildBars)}] ${buildPercent.toFixed(1)}%`);
    console.log(`    Execution: [${'█'.repeat(execBars)}${' '.repeat(40 - execBars)}] ${execPercent.toFixed(1)}%`);
  }

  private static printFailureAnalysis(metrics: Metrics): void {
    if (metrics.totalFailedAttempts === 0) {
      console.log('\n🎉 FAILURE ANALYSIS');
      console.log('─'.repeat(80));
      console.log('  ✨ No failures! All attempts succeeded.');
      return;
    }

    const strictValidationRate = metrics.workflowStrictValidationFailureRate * 100;
    const buildFailureRate = metrics.workflowBuildFailureRate * 100;
    const execFailureRate = metrics.workflowExecutionFailureRate * 100;
    
    console.log('\n🔍 FAILURE ANALYSIS');
    console.log('─'.repeat(80));
    console.log(`  Total Failed Attempts: ${metrics.totalFailedAttempts}/${metrics.totalAttempts}`);
    console.log('\n  Failure Breakdown (of failed attempts):');
    
    if (strictValidationRate > 0) {
      console.log(`    🔒 Strict Validation:  ${strictValidationRate.toFixed(1)}%`);
    }
    if (buildFailureRate > 0) {
      console.log(`    🏗️  Build Failures:     ${buildFailureRate.toFixed(1)}%`);
    }
    if (execFailureRate > 0) {
      console.log(`    ⚠️  Execution Failures: ${execFailureRate.toFixed(1)}%`);
    }
    
    const maxRate = Math.max(strictValidationRate, buildFailureRate, execFailureRate);
    if (maxRate === strictValidationRate && strictValidationRate > 0) {
      console.log('\n  💡 Primary Issue: Data validation - expected data doesn\'t match actual results');
    } else if (maxRate === buildFailureRate && buildFailureRate > 0) {
      console.log('\n  💡 Primary Issue: Workflow building - agent struggles to create valid plans');
    } else if (maxRate === execFailureRate && execFailureRate > 0) {
      console.log('\n  💡 Primary Issue: Workflow execution - plans fail during runtime');
    }
  }

  private static printDetailedMetrics(metrics: Metrics): void {
    console.log('\n📊 DETAILED METRICS');
    console.log('─'.repeat(80));
    
    console.log('  Attempt-Level Statistics:');
    console.log(`    Total Attempts:           ${metrics.totalAttempts}`);
    console.log(`    Successful Attempts:      ${metrics.totalSuccessfulAttempts}`);
    console.log(`    Failed Attempts:          ${metrics.totalFailedAttempts}`);
    console.log(`    Success Rate:             ${(metrics.overallSuccessRate * 100).toFixed(1)}%`);
    
    if (!isNaN(metrics.overallSelfHealingSuccessRate)) {
      console.log(`    Self-Healing Success:     ${(metrics.overallSelfHealingSuccessRate * 100).toFixed(1)}%`);
    }
    if (!isNaN(metrics.overallOneShotSuccessRate)) {
      console.log(`    One-Shot Success:         ${(metrics.overallOneShotSuccessRate * 100).toFixed(1)}%`);
    }
    
    console.log('\n  Workflow-Level Statistics:');
    console.log(`    Total Workflows:          ${metrics.workflowMetrics.length}`);
    const successfulWorkflows = metrics.workflowMetrics.filter(w => w.totalSuccessfulAttempts > 0).length;
    console.log(`    Successful Workflows:     ${successfulWorkflows}/${metrics.workflowMetrics.length}`);
    console.log(`    Workflow Success Rate:    ${(metrics.workflowSuccessRate * 100).toFixed(1)}%`);
    
    const failedWorkflows = metrics.workflowMetrics.filter(w => w.totalSuccessfulAttempts === 0).length;
    if (failedWorkflows > 0) {
      console.log(`    Failed Workflows:         ${failedWorkflows}/${metrics.workflowMetrics.length}`);
      
      const validationFailures = metrics.workflowMetrics.filter(w => w.latestFailureReason === WorkflowFailureReason.STRICT_VALIDATION).length;
      const buildFailures = metrics.workflowMetrics.filter(w => w.latestFailureReason === WorkflowFailureReason.BUILD).length;
      const execFailures = metrics.workflowMetrics.filter(w => w.latestFailureReason === WorkflowFailureReason.EXECUTION).length;
      
      console.log('\n  Workflow Failure Breakdown:');
      if (validationFailures > 0) console.log(`    🔒 Validation Failures:    ${validationFailures}`);
      if (buildFailures > 0) console.log(`    🏗️  Build Failures:         ${buildFailures}`);
      if (execFailures > 0) console.log(`    ⚠️  Execution Failures:     ${execFailures}`);
    }
  }

  private static printWorkflowBreakdown(metrics: Metrics): void {
    console.log('\n📋 WORKFLOW BREAKDOWN');
    console.log('─'.repeat(80));
    console.log('  Workflow                          Status  Success  1-Shot   Heal  Failure');
    console.log('  ' + '─'.repeat(78));
    
    const sortedWorkflows = [...metrics.workflowMetrics].sort((a, b) => {
      const rateA = a.totalAttempts > 0 ? a.totalSuccessfulAttempts / a.totalAttempts : 0;
      const rateB = b.totalAttempts > 0 ? b.totalSuccessfulAttempts / b.totalAttempts : 0;
      return rateB - rateA;
    });
    
    for (const workflow of sortedWorkflows) {
      this.printWorkflowRow(workflow);
    }
    
    console.log('  ' + '─'.repeat(78));
    console.log(`  Total: ${metrics.workflowMetrics.length} workflows`);
  }

  private static printWorkflowRow(workflow: WorkflowMetrics): void {
    const successRate = workflow.totalAttempts > 0 
      ? (workflow.totalSuccessfulAttempts / workflow.totalAttempts) * 100
      : 0;
    
    const oneShotRate = !isNaN(workflow.oneShotSuccessRate) 
      ? workflow.oneShotSuccessRate * 100
      : null;
    
    const selfHealingRate = !isNaN(workflow.selfHealingSuccessRate) 
      ? workflow.selfHealingSuccessRate * 100
      : null;
    
    const status = workflow.totalSuccessfulAttempts > 0 ? '✅' : '❌';
    
    // Truncate name to 32 chars
    const name = workflow.workflowConfig.name.length > 32 
      ? workflow.workflowConfig.name.substring(0, 29) + '...'
      : workflow.workflowConfig.name;
    const paddedName = name.padEnd(32);
    
    const successDisplay = `${successRate.toFixed(0)}%`.padStart(7);
    const oneShotDisplay = oneShotRate !== null ? `${oneShotRate.toFixed(0)}%`.padStart(7) : '   -   ';
    const healDisplay = selfHealingRate !== null ? `${selfHealingRate.toFixed(0)}%`.padStart(6) : '  -   ';
    
    let failureDisplay = '';
    if (workflow.latestFailureReason) {
      failureDisplay = this.formatFailureReason(workflow.latestFailureReason);
    }
    
    console.log(`  ${paddedName} ${status}    ${successDisplay} ${oneShotDisplay} ${healDisplay} ${failureDisplay}`);
  }

  private static formatFailureReason(reason: WorkflowFailureReason): string {
    switch (reason) {
      case WorkflowFailureReason.STRICT_VALIDATION:
        return '🔒 Validation';
      case WorkflowFailureReason.BUILD:
        return '🏗️  Build';
      case WorkflowFailureReason.EXECUTION:
        return '⚠️  Execution';
      default:
        return '';
    }
  }
}

import { loadConfig } from "./config/config-loader.js";
import { logMessage } from "../../packages/core/utils/logs.js";
import { FileStore } from "../../packages/core/datastore/filestore.js";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "node:url";
import { IntegrationSetupService } from "./services/integration-setup.js";
import { WorkflowRunnerService } from "./services/workflow-runner.js";
import path from "node:path";
import { config } from "dotenv";
import { MetricsCalculator } from "./services/metrics-calculator.js";
import { CsvReporter } from "./reporters/csv-reporter.js";
import { MarkdownReporter } from "./reporters/markdown-reporter.js";
import { MetricsComparer } from "./services/metrics-comparer.js";
import { ConsoleReporter } from "./reporters/console-reporter.js";
import { closeAllPools } from "../../packages/core/execute/postgres/postgres.js";
import { JsonReporter } from "./reporters/json-reporter.js";

const envPath = process.cwd().endsWith('packages/core')
  ? path.join(process.cwd(), '../../.env')
  : path.join(process.cwd(), '.env');
config({ path: envPath });

async function main(): Promise<void> {
  const startedAt = new Date();
  const metadata = { orgId: "agent-eval", userId: "system" };
  logMessage("info", "Starting Agent Evaluation...", metadata);

  let store: FileStore | undefined;

  try {
    const config = await loadConfig();
    const storePath = join(dirname(fileURLToPath(import.meta.url)), "./.data");
    store = new FileStore(storePath);

    const integrationSetupService = new IntegrationSetupService(store, config, metadata);
    const integrations = await integrationSetupService.setupIntegrations();
  
    const enabledWorkflows = config.enabledWorkflows === 'all' ? config.workflows : config.workflows.filter(workflow => config.enabledWorkflows.includes(workflow.id));

    const enabledWorkflowsCount = config.enabledWorkflows === 'all' ? config.workflows.length : config.enabledWorkflows.length;
    logMessage("info", `Integrations setup: ${integrations.length}, Workflows: ${config.workflows.length}, Enabled workflows: ${enabledWorkflowsCount}`, metadata);

    const agentEvalRunner = new WorkflowRunnerService(store, metadata);
    const workflowAttempts = await agentEvalRunner.runWorkflows(enabledWorkflows, integrations, config.settings);

    const metricsCalculatorService = new MetricsCalculator();
    const metrics = metricsCalculatorService.calculateMetrics(workflowAttempts);

    const baseDir = dirname(fileURLToPath(import.meta.url));
    
    const metricsComparer = new MetricsComparer(baseDir);
    const metricsComparison = metricsComparer.compare(metrics);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0];

    const csvReporter = new CsvReporter(baseDir, metadata);
    csvReporter.report(timestamp, metrics);
    
    const markdownReporter = new MarkdownReporter(baseDir, metadata);
    markdownReporter.report(timestamp, metrics, metricsComparison, workflowAttempts);
    
    const jsonReporter = new JsonReporter(baseDir, metadata);
    jsonReporter.reportAttempts(timestamp, workflowAttempts);

    const duration = new Date().getTime() - startedAt.getTime();
    logMessage("info", `Agent Evaluation Completed in ${(duration / 1000).toFixed(1)}s`, metadata);

    await new Promise(resolve => setTimeout(resolve, 1000));
    ConsoleReporter.report(metrics, metricsComparison, workflowAttempts);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error("Agent Eval failed:", message);
    logMessage("error", `Agent Eval failed: ${message}`, metadata);
    process.exitCode = 1;
  } finally {
    await closeAllPools();
    await store?.disconnect();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
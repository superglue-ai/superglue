import { loadConfig } from "./config-loader.js";
import { logMessage } from "../../utils/logs.js";
import { FileStore } from "../../datastore/filestore.js";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "node:url";
import { IntegrationSetupService } from "./integration-setup.js";
import { WorkflowRunnerService } from "./workflow-runner.js";
import path from "node:path";
import { config } from "dotenv";
import { MetricsCalculator } from "./metrics-calculator.js";
import { CsvReporter } from "./csv-reporter.js";
import { MarkdownReporter } from "./markdown-reporter.js";
import { MetricsComparer } from "./metrics-comparer.js";
import { ConsoleReporter } from "./console-reporter.js";
import { closeAllPools } from "../../execute/postgres/postgres.js";

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

    const csvReporter = new CsvReporter(baseDir, metadata);
    csvReporter.report(metrics);
    
    const markdownReporter = new MarkdownReporter(baseDir, metadata);
    markdownReporter.report(metrics, metricsComparison, workflowAttempts);
    
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

await main();
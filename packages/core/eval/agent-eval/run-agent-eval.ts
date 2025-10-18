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
import { JsonReporter } from "./json-reporter.js";
import { MetricsComparer } from "./metrics-comparer.js";
import { ConsoleReporter } from "./console-reporter.js";

const envPath = process.cwd().endsWith('packages/core')
  ? path.join(process.cwd(), '../../.env')
  : path.join(process.cwd(), '.env');
config({ path: envPath });

async function main(): Promise<void> {
  const startedAt = new Date();
  const metadata = { orgId: "agent-eval", userId: "system" };
  logMessage("info", "Starting Agent Evaluation...", metadata);

  try {
    const config = await loadConfig();
    const storePath = join(dirname(fileURLToPath(import.meta.url)), "./.data");
    const store = new FileStore(storePath);

    const integrationSetupService = new IntegrationSetupService(store, config, metadata);
    const integrations = await integrationSetupService.setupIntegrations();
    
    const enabledWorkflows = config.workflows.filter(workflow => config.enabledWorkflows.includes(workflow.id));

    logMessage("info", `Integrations setup: ${integrations.length}, Workflows: ${config.workflows.length}, Enabled workflows: ${config.enabledWorkflows.length}`, metadata);

    const agentEvalRunner = new WorkflowRunnerService(store, metadata);
    const workflowAttempts = await agentEvalRunner.runWorkflows(enabledWorkflows, integrations, config.settings);

    const metricsCalculatorService = new MetricsCalculator();
    const metrics = metricsCalculatorService.calculateMetrics(workflowAttempts);

    const jsonPath = join(dirname(fileURLToPath(import.meta.url)), "./agent-eval-results.json");
    const jsonReporter = new JsonReporter(jsonPath, metadata);
    const previousMetrics = jsonReporter.getLatestReport()?.metrics;

    jsonReporter.report(metrics);

    const metricsComparer = new MetricsComparer();
    const metricsComparison = metricsComparer.compare(metrics, previousMetrics);
    
    ConsoleReporter.report(metrics, metricsComparison, workflowAttempts);

    const duration = new Date().getTime() - startedAt.getTime();
    logMessage("info", `Agent Evaluation Completed in ${duration}ms`, metadata);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error("Agent Eval failed:", message);
    logMessage("error", `Agent Eval failed: ${message}`, metadata);
    process.exitCode = 1;
  }
}

await main();
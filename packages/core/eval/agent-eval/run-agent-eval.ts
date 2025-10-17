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
import { calculateMetrics } from "./metrics-calculator.js";
import { ConsoleReporter } from "./console-reporter.js";

const envPath = process.cwd().endsWith('packages/core')
  ? path.join(process.cwd(), '../../.env')
  : path.join(process.cwd(), '.env');
config({ path: envPath });

export async function main(): Promise<void> {
  const startedAt = new Date();
  const metadata = { orgId: "agent-eval", userId: "system" };
  logMessage("info", "Starting Agent Evaluation...", metadata);

  const config = await loadConfig();
  const storePath = join(dirname(fileURLToPath(import.meta.url)), "./.data");
  const store = new FileStore(storePath);

  const integrationSetupService = new IntegrationSetupService(store, config, metadata);
  const integrations = await integrationSetupService.setupIntegrations();
  
  const enabledWorkflows = config.workflows.filter(workflow => config.enabledWorkflows.includes(workflow.id));

  logMessage("info", `Integrations setup: ${integrations.length}, Workflows: ${config.workflows.length}, Enabled workflows: ${config.enabledWorkflows.length}`, metadata);

  const agentEvalRunner = new WorkflowRunnerService(store, metadata);
  const workflowAttempts = await agentEvalRunner.runWorkflows(enabledWorkflows, integrations);

  const metrics = calculateMetrics(workflowAttempts);
  ConsoleReporter.report(metrics);

  const duration = new Date().getTime() - startedAt.getTime();
  logMessage("info", `Agent Evaluation Completed in ${duration}ms`, metadata);
}

main();
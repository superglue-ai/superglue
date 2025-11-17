import { dirname, join } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Metadata } from "@superglue/shared";
import { initializeAIModel } from "@superglue/shared/utils";
import { config } from "dotenv";
import { PlaywrightFetchingStrategy } from "../../packages/core/documentation/strategies/fetching-playwright.js";
import { closeAllPools } from "../../packages/core/tools/tool-steps/tool-step-strategies/postgres/postgres.js";
import { shutdownSharedHtmlMarkdownPool } from "../../packages/core/utils/html-markdown-pool.js";
import { logMessage } from "../../packages/core/utils/logs.js";
import { loadConfig } from "../tool-evals/config/config-loader.js";
import { ConsoleReporter } from "../tool-evals/reporters/console-reporter.js";
import { CsvReporter } from "../tool-evals/reporters/csv-reporter.js";
import { JsonReporter } from "../tool-evals/reporters/json-reporter.js";
import { MetricsCalculator } from "../tool-evals/services/metrics-calculator.js";
import type { IntegrationConfig } from "../tool-evals/types.js";
import { LlmToolRunner } from "./services/llm-tool-runner.js";

// Load environment variables
const envPath = process.cwd().endsWith('packages/core')
  ? path.join(process.cwd(), '../../.env')
  : path.join(process.cwd(), '.env');
config({ path: envPath });

const PROVIDERS = [
  { name: 'gpt-4.1', envProvider: 'openai', envModel: 'gpt-4.1' },
  { name: 'gpt-5', envProvider: 'openai', envModel: 'gpt-5' },
  { name: 'claude-sonnet-4-5', envProvider: 'anthropic', envModel: 'claude-sonnet-4-5' },
  { name: 'claude-sonnet-4-20250514', envProvider: 'anthropic', envModel: 'claude-sonnet-4-20250514' },
  { name: 'gemini-2.5-flash-lite', envProvider: 'google', envModel: 'gemini-2.5-flash-lite' },
];

function applyEnvironmentVariablesToCredentials(
  integrations: IntegrationConfig[],
  metadata: Metadata
): void {
  for (const integration of integrations) {
    if (!integration.credentials || !integration.id) {
      continue;
    }

    for (const [key] of Object.entries(integration.credentials)) {
      const expectedEnvVarName = `${integration.id.toUpperCase().replace(/-/g, '_')}_${key.toUpperCase()}`;
      const envValue = process.env[expectedEnvVarName];

      if (envValue) {
        integration.credentials[key] = envValue;
      } else {
        logMessage('warn', `Missing credential: ${integration.id}.${key} (${expectedEnvVarName})`, metadata);
      }
    }

    // Special handling for postgres-lego: replace placeholders in urlHost
    if (integration.id === "postgres-lego") {
      integration.urlHost = integration.urlHost
        .replace("<<username>>", integration.credentials.username)
        .replace("<<password>>", integration.credentials.password)
        .replace("<<host>>", integration.credentials.host)
        .replace("<<port>>", integration.credentials.port)
        .replace("<<database>>", integration.credentials.database);
    }
  }
}

async function main(): Promise<void> {
  const metadata = { orgId: "llm-benchmark", userId: "system" };
  logMessage("info", "Starting LLM Benchmark Evaluation...", metadata);

  try {
    const evalConfig = await loadConfig("../../llm-benchmark-evals/llm-benchmark-config.json");
    const enabledTools = evalConfig.enabledTools === 'all' 
      ? evalConfig.tools 
      : evalConfig.tools.filter(tool => evalConfig.enabledTools.includes(tool.id));

    // Filter integrations to only those used by enabled tools
    const usedIntegrationIds = new Set(
      enabledTools.flatMap(tool => tool.integrationIds)
    );
    const integrations = evalConfig.integrations.filter(integration => 
      usedIntegrationIds.has(integration.id)
    );

    // Apply environment variables to credentials
    applyEnvironmentVariablesToCredentials(integrations, metadata);

    logMessage("info", `Loaded ${integrations.length} integrations, ${enabledTools.length} enabled tools`, metadata);

    const baseDir = dirname(fileURLToPath(import.meta.url));

    for (const provider of PROVIDERS) {
      const providerStartTime = Date.now();
      logMessage("info", `Running evaluation for provider: ${provider.name}`, metadata);

      // Set environment variables for this provider
      const originalProvider = process.env.LLM_PROVIDER;
      const originalModel = process.env[`${provider.envProvider.toUpperCase()}_MODEL`];
      
      process.env.LLM_PROVIDER = provider.envProvider;
      process.env[`${provider.envProvider.toUpperCase()}_MODEL`] = provider.envModel;

      const providerModel = initializeAIModel({
        providerEnvVar: 'LLM_PROVIDER',
        defaultModel: provider.envModel
      });

      const runner = new LlmToolRunner(metadata, evalConfig.validationLlmConfig);
      const toolAttempts = await runner.runToolsForProvider(
        providerModel,
        provider.name,
        enabledTools,
        integrations
      );

      const metricsCalculator = new MetricsCalculator();
      const metrics = metricsCalculator.calculateMetrics(toolAttempts);

      const timestamp = new Date().toISOString().split('.')[0].replace(/[:.]/g, '-');
      const providerSafeKey = provider.name.replace(/[^a-zA-Z0-9]/g, '-');

      const csvReporter = new CsvReporter(baseDir, metadata);
      csvReporter.report(`${timestamp}-${providerSafeKey}`, metrics);

      const jsonReporter = new JsonReporter(baseDir, metadata, 1);
      jsonReporter.reportAttempts(`${timestamp}-${providerSafeKey}`, toolAttempts, evalConfig);

      const duration = Date.now() - providerStartTime;
      logMessage("info", `Provider ${provider.name} completed in ${(duration / 1000).toFixed(1)}s`, metadata);

      await new Promise(resolve => setTimeout(resolve, 1000));
      ConsoleReporter.report(metrics, `${timestamp}-${providerSafeKey}`, baseDir);

      // Restore environment variables
      if (originalProvider !== undefined) {
        process.env.LLM_PROVIDER = originalProvider;
      } else {
        process.env.LLM_PROVIDER = undefined;
      }
      if (originalModel !== undefined) {
        process.env[`${provider.envProvider.toUpperCase()}_MODEL`] = originalModel;
      } else {
        delete process.env[`${provider.envProvider.toUpperCase()}_MODEL`];
      }
    }

    logMessage("info", "LLM Benchmark Evaluation Completed", metadata);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error("LLM Benchmark Eval failed:", message);
    logMessage("error", `LLM Benchmark Eval failed: ${message}`, metadata);
    process.exitCode = 1;
  } finally {
    await closeAllPools();
    await shutdownSharedHtmlMarkdownPool();
    await PlaywrightFetchingStrategy.closeBrowser();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


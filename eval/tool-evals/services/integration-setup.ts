import { ServiceMetadata } from "@superglue/shared";
import { Integration } from "@superglue/shared";
import { DataStore } from "../../../packages/core/datastore/types.js";
import { DocumentationFetcher } from "../../../packages/core/documentation/index.js";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { replaceVariables } from "../../../packages/core/utils/helpers.js";
import type { AgentEvalConfig, IntegrationConfig } from "../types.js";

export class IntegrationSetupService {
  constructor(
    private datastore: DataStore,
    private config: AgentEvalConfig,
    private metadata: ServiceMetadata,
  ) {}

  async setupIntegrations(): Promise<Integration[]> {
    const enabledTools =
      this.config.enabledTools === "all"
        ? this.config.tools
        : this.config.tools.filter((tool) => this.config.enabledTools.includes(tool.id));

    const usedIntegrationIds = new Set(enabledTools.flatMap((tool) => tool.integrationIds));

    const integrationConfigs = this.config.integrations.filter((integration) =>
      usedIntegrationIds.has(integration.id),
    );

    this.applyEnvironmentVariablesToConfigs(integrationConfigs);

    const integrations = await Promise.all(
      integrationConfigs.map((config) => this.setupSingleIntegration(config)),
    );

    logMessage(
      "info",
      `${integrations.length}/${integrationConfigs.length} integrations setup complete`,
      this.metadata,
    );
    return integrations;
  }

  private async setupSingleIntegration(integrationConfig: IntegrationConfig): Promise<Integration> {
    const existing = await this.datastore.getIntegration({
      id: integrationConfig.id,
      includeDocs: true,
      orgId: this.metadata.orgId,
    });

    if (existing) {
      logMessage("info", `${integrationConfig.name} already exists, skipping setup`, this.metadata);

      return {
        ...existing,
        credentials: integrationConfig.credentials,
      };
    }
    const scopedCredentials = Object.entries(integrationConfig.credentials ?? {}).reduce(
      (acc, [key, value]) => {
        acc[`${integrationConfig.id}_${key}`] = value;
        return acc;
      },
      {} as Record<string, string>,
    );

    const docFetcher = new DocumentationFetcher(
      {
        urlHost: await replaceVariables(integrationConfig.urlHost, scopedCredentials),
        urlPath: await replaceVariables(integrationConfig.urlPath, scopedCredentials),
        documentationUrl: await replaceVariables(
          integrationConfig.documentationUrl,
          scopedCredentials,
        ),
        openApiUrl: await replaceVariables(integrationConfig.openApiUrl, scopedCredentials),
        keywords: integrationConfig.keywords,
      },
      scopedCredentials,
      this.metadata,
    );

    const docString = await docFetcher.fetchAndProcess();

    await this.datastore.upsertIntegration({
      id: integrationConfig.id,
      integration: {
        id: integrationConfig.id,
        name: integrationConfig.name,
        urlHost: integrationConfig.urlHost,
        urlPath: integrationConfig.urlPath,
        documentationUrl: integrationConfig.documentationUrl,
        documentation: docString,
        documentationPending: false,
      },
      orgId: this.metadata.orgId,
    });

    const finalIntegration = await this.datastore.getIntegration({
      id: integrationConfig.id,
      includeDocs: true,
      orgId: this.metadata.orgId,
    });

    if (!finalIntegration) {
      throw new Error(`Failed to get integration ${integrationConfig.name}`);
    }

    return {
      ...finalIntegration,
      credentials: integrationConfig.credentials,
    };
  }

  private applyEnvironmentVariablesToConfigs(integrationConfigs: IntegrationConfig[]): void {
    for (const config of integrationConfigs) {
      if (!config.credentials || !config.id) {
        continue;
      }

      for (const [key, _] of Object.entries(config.credentials)) {
        const expectedEnvVarName = `${config.id.toUpperCase().replace(/-/g, "_")}_${key.toUpperCase()}`;
        const envValue = process.env[expectedEnvVarName];

        if (envValue) {
          config.credentials[key] = envValue;
        } else {
          logMessage("warn", `Missing credential: ${config.id}.${key} (${expectedEnvVarName})`);
        }
      }
    }
  }
}

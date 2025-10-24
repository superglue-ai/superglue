import { DataStore } from "../../../packages/core/datastore/types.js";
import { logMessage } from "../../../packages/core/utils/logs.js";
import type { AgentEvalConfig, IntegrationConfig } from "../types.js";
import { Integration } from "@superglue/client";
import { DocumentationFetcher } from "../../../packages/core/documentation/index.js";
import { Metadata } from "@playwright/test";

export class IntegrationSetupService {
  constructor(
    private datastore: DataStore,
    private config: AgentEvalConfig,
    private metadata: Metadata
  ) {}

  async setupIntegrations(): Promise<Integration[]> {
    const integrationConfigs = this.config.integrations;

    const integrations = await Promise.all(
      integrationConfigs.map((config) => this.setupSingleIntegration(config))
    );

    logMessage("info", `${integrations.length}/${integrationConfigs.length} integrations setup complete`, this.metadata);
    return this.applyEnvirnonmentVariables(integrations);
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

    if (!integrationConfig.documentationUrl || integrationConfig.documentationUrl.trim() === "") {
      logMessage("info", `${integrationConfig.name} has no documentation URL, skipping setup`, this.metadata);

      return {
        ...(existing ?? integrationConfig),
        credentials: integrationConfig.credentials,
      };
    }

    const docFetcher = new DocumentationFetcher(
      {
        urlHost: integrationConfig.urlHost,
        urlPath: integrationConfig.urlPath,
        documentationUrl: integrationConfig.documentationUrl,
        openApiUrl: integrationConfig.openApiUrl,
        keywords: integrationConfig.keywords,
      },
      integrationConfig.credentials || {},
      this.metadata
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

  private applyEnvirnonmentVariables(integrations: Integration[]): Integration[] {
    for (const integration of integrations) {
      if (!integration.credentials || !integration.id ) {
        continue;
      }

      for (const [key, _] of Object.entries(integration.credentials)) {
        const expectedEnvVarName = `${integration.id.toUpperCase().replace(/-/g, '_')}_${key.toUpperCase()}`;
        const envValue = process.env[expectedEnvVarName];

        if (envValue) {
          integration.credentials[key] = envValue;
        } else {
          logMessage('warn', `Missing credential: ${integration.id}.${key} (${expectedEnvVarName})`); //todo: hard fail, but only for enabled ones
        }
      }
    }

    return integrations;
  }
}

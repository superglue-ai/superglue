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
    const enabledTools = this.config.enabledTools === 'all' 
      ? this.config.tools 
      : this.config.tools.filter(tool => this.config.enabledTools.includes(tool.id));
    
    const usedIntegrationIds = new Set(
      enabledTools.flatMap(tool => tool.integrationIds)
    );
    
    const integrationConfigs = this.config.integrations.filter(integration => 
      usedIntegrationIds.has(integration.id)
    );

    this.applyEnvironmentVariablesToConfigs(integrationConfigs);

    const integrations = await Promise.all(
      integrationConfigs.map((config) => this.setupSingleIntegration(config))
    );

    logMessage("info", `${integrations.length}/${integrationConfigs.length} integrations setup complete`, this.metadata);
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

    if (integrationConfig.id === "postgres-lego") {
      // replace the username, password, host, port, and database in the urlHost with the values from the credentials
      integrationConfig.urlHost = integrationConfig.urlHost.replace("<<username>>", integrationConfig.credentials.username).replace("<<password>>", integrationConfig.credentials.password).replace("<<host>>", integrationConfig.credentials.host).replace("<<port>>", integrationConfig.credentials.port).replace("<<database>>", integrationConfig.credentials.database);
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

  private applyEnvironmentVariablesToConfigs(integrationConfigs: IntegrationConfig[]): void {
    for (const config of integrationConfigs) {
      if (!config.credentials || !config.id) {
        continue;
      }

      for (const [key, _] of Object.entries(config.credentials)) {
        const expectedEnvVarName = `${config.id.toUpperCase().replace(/-/g, '_')}_${key.toUpperCase()}`;
        const envValue = process.env[expectedEnvVarName];

        if (envValue) {
          config.credentials[key] = envValue;
        } else {
          logMessage('warn', `Missing credential: ${config.id}.${key} (${expectedEnvVarName})`);
        }
      }
    }
  }
}

import { ServiceMetadata } from "@superglue/shared";
import { System } from "@superglue/shared";
import { DataStore } from "../../../packages/core/datastore/types.js";
import { DocumentationFetcher } from "../../../packages/core/documentation/index.js";
import { logMessage } from "../../../packages/core/utils/logs.js";
import { replaceVariables } from "../../../packages/core/utils/helpers.js";
import type { AgentEvalConfig, SystemConfig } from "../types.js";

export class SystemSetupService {
  constructor(
    private datastore: DataStore,
    private config: AgentEvalConfig,
    private metadata: ServiceMetadata
  ) {}

  async setupSystems(): Promise<System[]> {
    const enabledTools = this.config.enabledTools === 'all' 
      ? this.config.tools 
      : this.config.tools.filter(tool => this.config.enabledTools.includes(tool.id));
    
    const usedSystemIds = new Set(
      enabledTools.flatMap(tool => tool.systemIds)
    );
    
    const systemConfigs = this.config.systems.filter(system => 
      usedSystemIds.has(system.id)
    );

    this.applyEnvironmentVariablesToConfigs(systemConfigs);

    const systems = await Promise.all(
      systemConfigs.map((config) => this.setupSingleSystem(config))
    );

    logMessage("info", `${systems.length}/${systemConfigs.length} systems setup complete`, this.metadata);
    return systems;
  }

  private async setupSingleSystem(systemConfig: SystemConfig): Promise<System> {
    const existing = await this.datastore.getSystem({
      id: systemConfig.id,
      includeDocs: true,
      orgId: this.metadata.orgId,
    });

    if (existing) {
      logMessage("info", `${systemConfig.name} already exists, skipping setup`, this.metadata);

      return {
        ...existing,
        credentials: systemConfig.credentials,
      };
    }
    const scopedCredentials = Object.entries(systemConfig.credentials ?? {}).reduce(
      (acc, [key, value]) => {
        acc[`${systemConfig.id}_${key}`] = value;
        return acc;
      },
      {} as Record<string, string>
    );

    const docFetcher = new DocumentationFetcher(
      {
        urlHost: await replaceVariables(systemConfig.urlHost, scopedCredentials),
        urlPath: await replaceVariables(systemConfig.urlPath, scopedCredentials),
        documentationUrl: await replaceVariables(systemConfig.documentationUrl, scopedCredentials),
        openApiUrl: await replaceVariables(systemConfig.openApiUrl, scopedCredentials),
        keywords: systemConfig.keywords,
      },
      scopedCredentials,
      this.metadata
    );

    const docString = await docFetcher.fetchAndProcess();

    await this.datastore.upsertSystem({
      id: systemConfig.id,
      system: {
        id: systemConfig.id,
        name: systemConfig.name,
        urlHost: systemConfig.urlHost,
        urlPath: systemConfig.urlPath,
        documentationUrl: systemConfig.documentationUrl,
        documentation: docString,
        documentationPending: false,
      },
      orgId: this.metadata.orgId,
    });

    const finalSystem = await this.datastore.getSystem({
      id: systemConfig.id,
      includeDocs: true,
      orgId: this.metadata.orgId,
    });

    if (!finalSystem) {
      throw new Error(`Failed to get system ${systemConfig.name}`);
    }

    return {
      ...finalSystem,
      credentials: systemConfig.credentials,
    };
  }

  private applyEnvironmentVariablesToConfigs(systemConfigs: SystemConfig[]): void {
    for (const config of systemConfigs) {
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

import { findTemplateForSystem, ServiceMetadata, System, Tool } from "@superglue/shared";
import { isMainThread, parentPort } from "worker_threads";
import { DataStore } from "../datastore/types.js";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { logMessage } from "../utils/logs.js";
import { isTokenExpired, refreshOAuthToken } from "../utils/oauth-token-refresh.js";

export interface DocumentationData {
  content?: string;
  openApiSchema?: string;
  fetchedAt?: Date;
  isFetched: boolean;
}

export class SystemManager {
  id: string;
  private _system: System;
  private _documentation: DocumentationData;
  private dataStore: DataStore | null;
  private metadata: ServiceMetadata;
  private orgId: string;
  private _basicDataPromise?: Promise<System>;
  private _documentationPromise?: Promise<DocumentationData>;
  private _enrichedFromTemplate = false; // Track if credentials came from template

  constructor(idOrSystem: string | System, dataStore: DataStore | null, metadata: ServiceMetadata) {
    this.dataStore = dataStore;
    this.metadata = metadata;
    this.orgId = metadata.orgId!;

    if (typeof idOrSystem === "string") {
      this.id = idOrSystem;
      this._documentation = {
        isFetched: false,
      };
    } else {
      this.id = idOrSystem.id;
      this._system = idOrSystem;

      this._documentation = {
        content: idOrSystem.documentation,
        openApiSchema: idOrSystem.openApiSchema,
        isFetched: !!idOrSystem.documentation || !!idOrSystem.openApiSchema,
        fetchedAt: idOrSystem.documentation ? new Date() : undefined,
      };
    }
  }

  async getSystem(): Promise<System> {
    if (this._system) return this._system;

    if (!this.dataStore) {
      throw new Error(`System ${this.id} not initialized and datastore unavailable`);
    }

    if (this._basicDataPromise) {
      await this._basicDataPromise;
      return this._system;
    }

    this._basicDataPromise = (async () => {
      try {
        const system = await this.dataStore!.getSystem({
          id: this.id,
          includeDocs: false,
          orgId: this.orgId,
        });
        this._system = system;
        return system;
      } finally {
        this._basicDataPromise = undefined;
      }
    })();

    await this._basicDataPromise;
    return this._system;
  }

  async getDocumentation(): Promise<DocumentationData> {
    if (this._documentation?.isFetched) {
      return this._documentation;
    }

    if (!this.dataStore) {
      return this._documentation || { isFetched: false };
    }

    try {
      const fullSystem = await this.dataStore.getSystem({
        id: this.id,
        includeDocs: true,
        orgId: this.orgId,
      });

      if (fullSystem) {
        this._documentation = {
          content: fullSystem.documentation,
          openApiSchema: fullSystem.openApiSchema,
          isFetched: true,
          fetchedAt: new Date(),
        };
        this._system = fullSystem;
      }
      logMessage("info", `Documentation loaded for system ${this.id}`, this.metadata);
    } catch (error) {
      logMessage(
        "error",
        `Failed to load documentation for system ${this.id}: ${error}`,
        this.metadata,
      );
    }

    return this._documentation;
  }
  private searchCache = new Map<string, string>();

  async searchDocumentation(instruction: string): Promise<string> {
    if (this.searchCache.has(instruction)) {
      return this.searchCache.get(instruction);
    }
    const documentation = await this.getDocumentation();
    if (!documentation.openApiSchema && !documentation.content) {
      return "no documentation provided";
    }
    const documentationSearch = new DocumentationSearch(this.metadata);
    const result = documentationSearch.extractRelevantSections(
      documentation.content,
      instruction,
      5,
      4000,
      documentation.openApiSchema,
    );
    this.searchCache.set(instruction, result);
    return result;
  }

  toSystemSync(): System {
    return this._system;
  }

  async refreshTokenIfNeeded(): Promise<boolean> {
    await this.getSystem();
    if (!isTokenExpired(this._system)) {
      return false;
    }

    const refreshResult = await refreshOAuthToken(this._system, this.metadata);

    if (refreshResult.success) {
      this._system.credentials = refreshResult.newCredentials;

      // Strip template credentials before persisting - they should stay in the template table
      const credentialsToStore = this._enrichedFromTemplate
        ? (({ client_id, client_secret, ...rest }) => rest)(refreshResult.newCredentials)
        : refreshResult.newCredentials;

      if (!isMainThread && parentPort) {
        parentPort.postMessage({
          type: "credential_update",
          payload: {
            systemId: this.id,
            orgId: this.orgId,
            credentials: credentialsToStore,
          },
        });
      } else if (this.dataStore) {
        await this.dataStore.upsertSystem({
          id: this.id,
          system: { ...this._system, credentials: credentialsToStore },
          orgId: this.orgId,
        });
      }

      logMessage("info", `OAuth token refreshed for system ${this.id}`, this.metadata);
    } else {
      logMessage("warn", `Failed to refresh OAuth token for system ${this.id}`, this.metadata);
    }

    return refreshResult.success;
  }

  /**
   * Enriches the system with OAuth credentials from its matching template.
   * If client_id or client_secret is missing, fetches both from the template.
   */
  async enrichWithTemplateCredentials(): Promise<boolean> {
    await this.getSystem();

    if (this._system.credentials?.client_id && this._system.credentials?.client_secret) {
      return false;
    }
    if (!this.dataStore) return false;

    const match = findTemplateForSystem(this._system);
    if (!match) return false;

    const templateCreds = await this.dataStore
      .getTemplateOAuthCredentials({ templateId: match.key })
      .catch(() => null);
    if (!templateCreds) return false;

    this._system.credentials = {
      ...this._system.credentials,
      client_id: templateCreds.client_id,
      client_secret: templateCreds.client_secret,
    };
    this._enrichedFromTemplate = true;

    logMessage(
      "debug",
      `Enriched system ${this.id} with template credentials from ${match.key}`,
      this.metadata,
    );

    return true;
  }

  static fromSystem(
    system: System,
    dataStore: DataStore,
    metadata: ServiceMetadata,
  ): SystemManager {
    return new SystemManager(system, dataStore, metadata);
  }

  static async fromId(
    id: string,
    dataStore: DataStore,
    metadata: ServiceMetadata,
  ): Promise<SystemManager> {
    const system = await dataStore.getSystem({
      id,
      includeDocs: false,
      orgId: metadata.orgId!,
    });
    if (!system) {
      throw new Error(`System with id ${id} not found`);
    }
    return new SystemManager(system, dataStore, metadata);
  }

  static fromSystems(
    systems: System[],
    dataStore: DataStore,
    metadata: ServiceMetadata,
  ): SystemManager[] {
    return systems.map((i) => SystemManager.fromSystem(i, dataStore, metadata));
  }

  static async fromIds(
    ids: string[],
    dataStore: DataStore,
    metadata: ServiceMetadata,
  ): Promise<SystemManager[]> {
    return Promise.all(ids.map((id) => SystemManager.fromId(id, dataStore, metadata)));
  }

  static async forToolExecution(
    tool: Tool,
    dataStore: DataStore,
    metadata: ServiceMetadata,
    options: { includeDocs?: boolean } = {},
  ): Promise<SystemManager[]> {
    const allIds = new Set<string>();

    if (Array.isArray(tool.systemIds)) {
      tool.systemIds.forEach((id) => allIds.add(id));
    }
    if (Array.isArray(tool.steps)) {
      tool.steps.forEach((step) => {
        if (step.systemId) {
          allIds.add(step.systemId);
        }
      });
    }

    if (allIds.size === 0) {
      return [];
    }

    const systems = await dataStore.getManySystems({
      ids: Array.from(allIds),
      includeDocs: options.includeDocs ?? false,
      orgId: metadata.orgId,
    });

    const managers = systems.map((i) => new SystemManager(i, dataStore, metadata));

    // Enrich with template credentials and refresh tokens (workers don't have datastore access)
    await Promise.all(
      managers.map(async (manager) => {
        await manager.enrichWithTemplateCredentials();
        await manager.refreshTokenIfNeeded();
      }),
    );

    return managers;
  }
}

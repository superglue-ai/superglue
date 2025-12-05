import { Integration, ServiceMetadata, Tool } from "@superglue/shared";
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

export class IntegrationManager {
    // Core fields from Integration interface

    // State management
    id: string;
    private _integration: Integration;
    private _documentation: DocumentationData;
    private dataStore: DataStore;
    private metadata: ServiceMetadata;
    private orgId: string; // Keep for backward compat
    private _basicDataPromise?: Promise<Integration>;
    private _documentationPromise?: Promise<DocumentationData>;

    constructor(idOrIntegration: string | Integration, dataStore: DataStore, metadata: ServiceMetadata) {
        this.dataStore = dataStore;
        this.metadata = metadata;
        this.orgId = metadata.orgId!; // Keep for backward compat

        if (typeof idOrIntegration === 'string') {
            // Initialize with just ID - will lazy load everything else
            this.id = idOrIntegration;
            this._documentation = {
                isFetched: false
            };
        } else {
            // Initialize with full integration object
            this.id = idOrIntegration.id;
            this._integration = idOrIntegration;

            // Initialize documentation object
            this._documentation = {
                content: idOrIntegration.documentation,
                openApiSchema: idOrIntegration.openApiSchema,
                isFetched: !!idOrIntegration.documentation || !!idOrIntegration.openApiSchema,
                fetchedAt: idOrIntegration.documentation ? new Date() : undefined
            };
        }
    }
    // Ensure basic data is loaded (without documentation)
    async getIntegration(): Promise<Integration> {
        if (this._integration) return this._integration;

        // Prevent multiple simultaneous loads
        if (this._basicDataPromise) {
            await this._basicDataPromise;
            return this._integration;
        }

        this._basicDataPromise = (async () => {
            try {
                const integration = await this.dataStore.getIntegration({ id: this.id, includeDocs: false, orgId: this.orgId });
                this._integration = integration;
                return integration;
            } finally {
                this._basicDataPromise = undefined;
            }
        })();

        await this._basicDataPromise;
        return this._integration;
    }

    // Async method to ensure documentation is loaded
    async getDocumentation(): Promise<DocumentationData> {
        // If already fetched, return current state
        if (this._documentation?.isFetched) {
            return this._documentation;
        }

        try {
            // Fetch the full integration with details from datastore
            const fullIntegration = await this.dataStore.getIntegration({ id: this.id, includeDocs: true, orgId: this.orgId });
            
            if (fullIntegration) {
                this._documentation = {
                    content: fullIntegration.documentation,
                    openApiSchema: fullIntegration.openApiSchema,
                    isFetched: true,
                    fetchedAt: new Date()
                };
                this._integration = fullIntegration;
            }
            logMessage('info', `Documentation loaded for integration ${this.id}`, this.metadata);
        } catch (error) {
            logMessage('error', `Failed to load documentation for integration ${this.id}: ${error}`, this.metadata);
        }

        return this._documentation;
    }
    private searchCache = new Map<string, string>();

    async searchDocumentation(instruction: string): Promise<string> {
        if(this.searchCache.has(instruction)) {
            return this.searchCache.get(instruction);
        }
        const documentation = await this.getDocumentation();
        if(!documentation.openApiSchema && !documentation.content) {
            return "no documentation provided";
        }
        const documentationSearch = new DocumentationSearch(this.metadata);
        const result = documentationSearch.extractRelevantSections(documentation.content, instruction, 5, 4000, documentation.openApiSchema);
        this.searchCache.set(instruction, result);
        return result;
    }

    // Sync version of toIntegration for backward compatibility (may return incomplete data)
    toIntegrationSync(): Integration {
        return this._integration;
    }


    /**
     * Refreshes the OAuth token if it's expired or about to expire
     * @returns true if token was refreshed and saved, false otherwise
     */
    async refreshTokenIfNeeded(): Promise<boolean> {
        // Check if token needs refresh
        await this.getIntegration();
        if (!isTokenExpired(this._integration)) {
            return false;
        }

        const refreshResult = await refreshOAuthToken(this._integration);
        
        if (refreshResult.success) {
            // update the credentials in the integration manager
            this._integration.credentials = refreshResult.newCredentials;
            
            if (!isMainThread && parentPort) {
                parentPort.postMessage({
                    type: 'credential_update',
                    payload: {
                        integrationId: this.id,
                        orgId: this.orgId,
                        credentials: refreshResult.newCredentials
                    }
                });
            } else if (this.dataStore) {
                await this.dataStore.upsertIntegration({
                    id: this.id,
                    integration: this._integration,
                    orgId: this.orgId
                });
            }
            
            logMessage('info', `OAuth token refreshed for integration ${this.id}`, this.metadata);
        } else {
            logMessage('warn', `Failed to refresh OAuth token for integration ${this.id}`, this.metadata);
        }

        return refreshResult.success;
    }

    // Static factory method to create from Integration
    static fromIntegration(integration: Integration, dataStore: DataStore, metadata: ServiceMetadata): IntegrationManager {
        return new IntegrationManager(integration, dataStore, metadata);
    }

    // Static factory method to create from ID only
    static async fromId(id: string, dataStore: DataStore, metadata: ServiceMetadata): Promise<IntegrationManager> {
        const integration = await dataStore.getIntegration({ id, includeDocs: false, orgId: metadata.orgId! });
        if (!integration) {
            throw new Error(`Integration with id ${id} not found`);
        }
        return new IntegrationManager(integration, dataStore, metadata);
    }

    // Static method to create multiple instances
    static fromIntegrations(integrations: Integration[], dataStore: DataStore, metadata: ServiceMetadata): IntegrationManager[] {
        return integrations.map(i => IntegrationManager.fromIntegration(i, dataStore, metadata));
    }

    // Static method to create multiple instances from IDs
    static async fromIds(ids: string[], dataStore: DataStore, metadata: ServiceMetadata): Promise<IntegrationManager[]> {
        return Promise.all(ids.map(id => IntegrationManager.fromId(id, dataStore, metadata)));
    }

    static async forToolExecution(
        tool: Tool,
        dataStore: DataStore,
        metadata: ServiceMetadata,
        options: { includeDocs?: boolean } = {}
    ): Promise<IntegrationManager[]> {
        const allIds = new Set<string>();
        
        if (Array.isArray(tool.integrationIds)) {
            tool.integrationIds.forEach(id => allIds.add(id));
        }
        if (Array.isArray(tool.steps)) {
            tool.steps.forEach(step => {
                if (step.integrationId) {
                    allIds.add(step.integrationId);
                }
            });
        }

        if (allIds.size === 0) {
            return [];
        }

        const integrations = await dataStore.getManyIntegrations({ 
            ids: Array.from(allIds), 
            includeDocs: options.includeDocs ?? false,
            orgId: metadata.orgId 
        });

        const managers = integrations.map(i => new IntegrationManager(i, dataStore, metadata));

        for (const manager of managers) {
            await manager.refreshTokenIfNeeded();
        }

        return managers;
    }
}
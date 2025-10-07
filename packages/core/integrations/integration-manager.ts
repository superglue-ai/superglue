import { Integration } from "@superglue/client";
import { DataStore } from "../datastore/types.js";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { logMessage } from "../utils/logs.js";
import { isTokenExpired, refreshOAuthToken } from "../utils/oauth.js";

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
    private orgId: string;
    private _basicDataPromise?: Promise<Integration>;
    private _documentationPromise?: Promise<DocumentationData>;

    constructor(idOrIntegration: string | Integration, dataStore: DataStore, orgId: string) {
        this.dataStore = dataStore;
        this.orgId = orgId;

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
            return;
        }

        this._basicDataPromise = (async () => {
            try {
                const integration = await this.dataStore.getIntegration({ id: this.id, includeDocs: false, orgId: this.orgId });
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
            logMessage('info', `Documentation loaded for integration ${this.id}`, { orgId: this.orgId });
        } catch (error) {
            logMessage('error', `Failed to load documentation for integration ${this.id}: ${error}`, { orgId: this.orgId });
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
        const documentationSearch = new DocumentationSearch();
        const result = documentationSearch.extractRelevantSections(documentation.content, instruction, 5, 4000);
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

        // Attempt to refresh the token
        const refreshResult = await refreshOAuthToken(this._integration);
        
        if (refreshResult.success) {
            // update the credentials in the integration manager
            this._integration.credentials = refreshResult.newCredentials;
            // Save the updated credentials to datastore
            await this.dataStore.upsertIntegration({
              id: this.id,
              integration: this._integration,
              orgId: this.orgId
            });
            logMessage('info', `OAuth token refreshed and saved for integration ${this.id}`, { orgId: this.orgId });
        } else {
            logMessage('warn', `Failed to refresh OAuth token for integration ${this.id}`, { orgId: this.orgId });
        }

        return refreshResult.success;
    }

    // Static factory method to create from Integration
    static fromIntegration(integration: Integration, dataStore: DataStore, orgId: string): IntegrationManager {
        return new IntegrationManager(integration, dataStore, orgId);
    }

    // Static factory method to create from ID only
    static async fromId(id: string, dataStore: DataStore, orgId: string): Promise<IntegrationManager> {
        const integration = await dataStore.getIntegration({ id, includeDocs: false, orgId });
        if (!integration) {
            throw new Error(`Integration with id ${id} not found`);
        }
        return new IntegrationManager(integration, dataStore, orgId);
    }

    // Static method to create multiple instances
    static fromIntegrations(integrations: Integration[], dataStore: DataStore, orgId: string): IntegrationManager[] {
        return integrations.map(i => IntegrationManager.fromIntegration(i, dataStore, orgId));
    }

    // Static method to create multiple instances from IDs
    static async fromIds(ids: string[], dataStore: DataStore, orgId: string): Promise<IntegrationManager[]> {
        return Promise.all(ids.map(id => IntegrationManager.fromId(id, dataStore, orgId)));
    }
}
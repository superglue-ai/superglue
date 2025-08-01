import { Integration } from "@superglue/client";
import { DataStore } from "../datastore/types.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";
import { isTokenExpired, refreshOAuthToken } from "../utils/oauth.js";

export interface DocumentationData {
    content?: Promise<string>;
    openApiSchema?: Promise<string>;
    fetchedAt?: Date;
    isFetched: boolean;
}

export class IntegrationManager {
    // Core fields from Integration interface
    private _name?: string;
    private _type?: string;
    private _urlHost?: string;
    private _urlPath?: string;
    private _credentials?: Record<string, any>;
    private _documentationUrl?: string;
    private _documentationPending?: boolean;
    private _openApiUrl?: string;
    private _specificInstructions?: string;
    private _icon?: string;
    id: string;
    private _version?: string;
    private _createdAt?: Date;
    private _updatedAt?: Date;

    // State management
    private _documentation: DocumentationData;
    private dataStore: DataStore;
    private orgId: string;
    private _isBasicDataLoaded: boolean = false;
    private _loadingPromise?: Promise<void>;

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
            this._name = idOrIntegration.name;
            this._type = idOrIntegration.type;
            this._urlHost = idOrIntegration.urlHost;
            this._urlPath = idOrIntegration.urlPath;
            this._credentials = idOrIntegration.credentials;
            this._documentationUrl = idOrIntegration.documentationUrl;
            this._documentationPending = idOrIntegration.documentationPending;
            this._openApiUrl = idOrIntegration.openApiUrl;
            this._specificInstructions = idOrIntegration.specificInstructions;
            this._icon = idOrIntegration.icon;
            this._version = idOrIntegration.version;
            this._createdAt = idOrIntegration.createdAt;
            this._updatedAt = idOrIntegration.updatedAt;
            this._isBasicDataLoaded = true;

            // Initialize documentation object
            this._documentation = {
                content: Promise.resolve(idOrIntegration.documentation),
                openApiSchema: Promise.resolve(idOrIntegration.openApiSchema),
                isFetched: !!idOrIntegration.documentation || !!idOrIntegration.openApiSchema,
                fetchedAt: idOrIntegration.documentation ? new Date() : undefined
            };
        }
    }
    // Ensure basic data is loaded (without documentation)
    private async ensureBasicDataLoaded(): Promise<void> {
        if (this._isBasicDataLoaded) return;

        // Prevent multiple simultaneous loads
        if (this._loadingPromise) {
            await this._loadingPromise;
            return;
        }

        this._loadingPromise = (async () => {
            try {
                const integration = await this.dataStore.getIntegration({ id: this.id, includeDocs: false, orgId: this.orgId });
                if (integration) {
                    this._name = integration.name;
                    this._type = integration.type;
                    this._urlHost = integration.urlHost;
                    this._urlPath = integration.urlPath;
                    this._credentials = integration.credentials;
                    this._documentationUrl = integration.documentationUrl;
                    this._documentationPending = integration.documentationPending;
                    this._openApiUrl = integration.openApiUrl;
                    this._specificInstructions = integration.specificInstructions;
                    this._icon = integration.icon;
                    this._version = integration.version;
                    this._createdAt = integration.createdAt;
                    this._updatedAt = integration.updatedAt;
                    this._isBasicDataLoaded = true;
                }
            } finally {
                this._loadingPromise = undefined;
            }
        })();

        await this._loadingPromise;
    }

    // Getters with lazy loading
    get name(): string | undefined {
        if (!this._isBasicDataLoaded) {
            // Return undefined for now, but trigger async load
            this.ensureBasicDataLoaded().catch(err => 
                logMessage('error', `Failed to load basic data for integration ${this.id}: ${err}`, { orgId: this.orgId })
            );
        }
        return this._name;
    }

    get type(): string | undefined { return this._type; }
    get urlHost(): string | undefined { return this._urlHost; }
    get urlPath(): string | undefined { return this._urlPath; }
    get credentials(): Record<string, any> | undefined { return this._credentials; }
    get documentationUrl(): string | undefined { return this._documentationUrl; }
    get documentationPending(): boolean | undefined { return this._documentationPending; }
    get openApiUrl(): string | undefined { return this._openApiUrl; }
    get specificInstructions(): string | undefined { return this._specificInstructions; }
    get icon(): string | undefined { return this._icon; }Ò
    get version(): string | undefined { return this._version; }
    get createdAt(): Date | undefined { return this._createdAt; }
    get updatedAt(): Date | undefined { return this._updatedAt; }

    // Setters
    set name(value: string | undefined) { this._name = value; }
    set type(value: string | undefined) { this._type = value; }
    set urlHost(value: string | undefined) { this._urlHost = value; }
    set urlPath(value: string | undefined) { this._urlPath = value; }
    set credentials(value: Record<string, any> | undefined) { this._credentials = value; }
    set documentationUrl(value: string | undefined) { this._documentationUrl = value; }
    set documentationPending(value: boolean | undefined) { this._documentationPending = value; }
    set openApiUrl(value: string | undefined) { this._openApiUrl = value; }
    set specificInstructions(value: string | undefined) { this._specificInstructions = value; }
    set icon(value: string | undefined) { this._icon = value; }
    set version(value: string | undefined) { this._version = value; }
    set createdAt(value: Date | undefined) { this._createdAt = value; }
    set updatedAt(value: Date | undefined) { this._updatedAt = value; }

    // Getter for documentation that returns the string for backward compatibility
    get documentation(): Promise<string> {
        return this._documentation.content;
    }

    // Setter for documentation
    set documentation(value: Promise<string | undefined>) {
        this._documentation.content = value;
        this._documentation.isFetched = true;
        this._documentation.fetchedAt = new Date();
    }

    // Get the full documentation object
    get documentationObject(): DocumentationData {
        return this._documentation;
    }

    // Get the openApiSchema from documentation object
    get openApiSchema(): Promise<string | undefined> {
        return this._documentation.openApiSchema;
    }

    // Async method to ensure documentation is loaded
    async ensureDocumentationLoaded(): Promise<DocumentationData> {
        // If already fetched, return current state
        if (this._documentation.isFetched) {
            return this._documentation;
        }

        await this.ensureBasicDataLoaded();

        try {
            // Fetch the full integration with details from datastore
            const fullIntegration = await this.dataStore.getIntegration({ id: this.id, includeDocs: true, orgId: this.orgId });
            
            if (fullIntegration) {
                this._documentation = {
                    content: Promise.resolve(fullIntegration.documentation),
                    openApiSchema: Promise.resolve(fullIntegration.openApiSchema),
                    isFetched: true,
                    fetchedAt: new Date()
                };

                // Update other fields that might have changed
                this._documentationPending = fullIntegration.documentationPending;
                this._specificInstructions = fullIntegration.specificInstructions;
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
        const documentation = await this.ensureDocumentationLoaded();
        if(!await documentation.openApiSchema && !await documentation.content) {
            return "no documentation provided";
        }
        const result = Documentation.extractRelevantSections(await documentation.openApiSchema || await documentation.content, instruction);
        this.searchCache.set(instruction, result);
        return result;
    }
  
    // Check if documentation needs to be fetched
    needsDocumentationFetch(): boolean {
        return !this._documentation.isFetched && !this._documentationPending;
    }

    // Convert back to plain Integration object
    async toIntegration(): Promise<Integration> {
        // Ensure all data is loaded before converting
        await this.ensureBasicDataLoaded();
        
        return {
            id: this.id,
            name: this._name,
            type: this._type,
            urlHost: this._urlHost,
            urlPath: this._urlPath,
            credentials: this._credentials,
            documentationUrl: this._documentationUrl,
            documentation: await this._documentation.content,
            documentationPending: this._documentationPending,
            openApiUrl: this._openApiUrl,
            openApiSchema: await this._documentation.openApiSchema,
            specificInstructions: this._specificInstructions,
            icon: this._icon,
            version: this._version,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt
        };
    }

    // Sync version of toIntegration for backward compatibility (may return incomplete data)
    toIntegrationSync(): Integration {
        return {
            id: this.id,
            name: this._name,
            type: this._type,
            urlHost: this._urlHost,
            urlPath: this._urlPath,
            credentials: this._credentials,
            documentationUrl: this._documentationUrl,
            documentation: this._documentation.isFetched ? String(this._documentation.content) : "",
            documentationPending: this._documentationPending,
            openApiUrl: this._openApiUrl,
            openApiSchema: this._documentation.isFetched ? String(this._documentation.openApiSchema) : "",
            specificInstructions: this._specificInstructions,
            icon: this._icon,
            version: this._version,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt
        };
    }

    /**
     * Refreshes the OAuth token if it's expired or about to expire
     * @returns true if token was refreshed and saved, false otherwise
     */
    async refreshTokenIfNeeded(): Promise<boolean> {
        // Check if token needs refresh
        if (!isTokenExpired(this.toIntegrationSync())) {
            return false;
        }

        // Attempt to refresh the token
        const refreshResult = await refreshOAuthToken(this.toIntegrationSync());
        
        if (refreshResult.success) {
            // update the credentials in the integration manager
            this.credentials = refreshResult.newCredentials;
            // Save the updated credentials to datastore
            await this.dataStore.upsertIntegration({
              id: this.id,
              integration: this.toIntegrationSync(),
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
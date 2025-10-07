import { Integration } from '@superglue/client';
import { waitForIntegrationProcessing } from '@superglue/shared/utils';
import fs from 'fs';
import { FileStore } from '../../datastore/filestore.js';
import { DataStore } from '../../datastore/types.js';
import { server_defaults } from '../../default.js';
import { logMessage } from '../../utils/logs.js';
import { IntegrationConfig } from './config-loader.js';

export interface SetupResult {
    datastore: DataStore;
    integrations: Integration[];
    setupTime: number;
    documentationProcessingTime: number;
    cleanupFunction: () => Promise<void>;
}

export interface IntegrationSetupResult {
    integrationId: string;
    name: string;
    setupTime: number;
    documentationProcessingTime?: number;
    success: boolean;
    error?: string;
}

export class SetupManager {
    private metadata: { orgId: string; userId: string };

    constructor(
        private testDirPath: string = './.test-data',
        orgId: string = 'test-org',
        userId: string = 'system'
    ) {
        this.metadata = { orgId, userId };
    }

    /**
     * Complete setup for testing: datastore + integrations
     */
    async setupTestEnvironment(
        integrationConfigs: IntegrationConfig[]
    ): Promise<SetupResult> {
        const startTime = Date.now();

        // Initialize datastore
        const datastore = await this.initializeDatastore();

        // Setup integrations
        const { integrations, setupResults, documentationProcessingTime } =
            await this.setupIntegrations(datastore, integrationConfigs);

        const setupTime = Date.now() - startTime;

        logMessage('info', `✅ Test environment setup completed in ${setupTime}ms`, this.metadata);

        return {
            datastore,
            integrations,
            setupTime,
            documentationProcessingTime,
            cleanupFunction: () => this.cleanup()
        };
    }

    /**
     * Initialize file-based datastore
     */
    private async initializeDatastore(): Promise<DataStore> {
        logMessage('info', `📁 Initializing datastore at ${this.testDirPath}...`, this.metadata);

        // Ensure directory exists
        if (!fs.existsSync(this.testDirPath)) {
            fs.mkdirSync(this.testDirPath, { recursive: true });
        }

        const datastore = new FileStore(this.testDirPath);
        logMessage('info', `✅ Datastore initialized`, this.metadata);

        return datastore;
    }

    /**
     * Setup integrations with documentation processing
     */
    private async setupIntegrations(
        datastore: DataStore,
        integrationConfigs: IntegrationConfig[]
    ): Promise<{
        integrations: Integration[];
        setupResults: IntegrationSetupResult[];
        documentationProcessingTime: number;
    }> {
        const startTime = Date.now();
        logMessage('info', `🔧 Setting up ${integrationConfigs.length} integrations...`, this.metadata);

        const integrations: Integration[] = [];
        const setupResults: IntegrationSetupResult[] = [];
        const pendingIntegrations: string[] = [];

        for (const config of integrationConfigs) {
            const integrationStartTime = Date.now();
            logMessage('info', `⚙️  Setting up integration: ${config.name}`, this.metadata);

            try {
                const integration = this.makeIntegrationObject(config);

                // Start async documentation fetch if documentation is pending
                if (integration.documentationPending) {
                    this.startDocumentationFetch(
                        datastore,
                        integration,
                        config
                    );
                    pendingIntegrations.push(integration.id);
                }

                // Save to datastore
                const saved = await datastore.upsertIntegration({
                    id: integration.id,
                    integration,
                    orgId: this.metadata.orgId
                });

                integrations.push(saved);

                const setupTime = Date.now() - integrationStartTime;
                setupResults.push({
                    integrationId: config.id,
                    name: config.name,
                    setupTime,
                    success: true
                });

                logMessage('info',
                    `✅ Integration ${config.name} setup in ${setupTime}ms` +
                    (saved.documentationPending ? ' (documentation pending)' : ''),
                    this.metadata
                );

            } catch (error) {
                const setupTime = Date.now() - integrationStartTime;
                const errorMsg = error instanceof Error ? error.message : String(error);

                setupResults.push({
                    integrationId: config.id,
                    name: config.name,
                    setupTime,
                    success: false,
                    error: errorMsg
                });

                logMessage('error', `❌ Failed to setup ${config.name}: ${errorMsg}`, this.metadata);
            }
        }

        // Wait for documentation processing
        let documentationProcessingTime = 0;
        if (pendingIntegrations.length > 0) {
            documentationProcessingTime = await this.waitForDocumentation(
                datastore,
                pendingIntegrations,
                setupResults
            );
        }

        // Refresh integrations to get the latest state after documentation processing
        const refreshedIntegrations: Integration[] = [];
        for (const integration of integrations) {
            const updated = await datastore.getIntegration({ id: integration.id, includeDocs: true, orgId: this.metadata.orgId });
            if (updated) {
                refreshedIntegrations.push(updated);
            } else {
                // If integration was deleted, keep the original
                refreshedIntegrations.push(integration);
            }
        }

        const totalSetupTime = Date.now() - startTime;
        logMessage('info',
            `🔧 Integration setup completed in ${totalSetupTime}ms ` +
            `(documentation: ${documentationProcessingTime}ms)`,
            this.metadata
        );

        return {
            integrations: refreshedIntegrations,
            setupResults,
            documentationProcessingTime
        };
    }

    /**
     * Start async documentation fetch
     */
    private startDocumentationFetch(
        datastore: DataStore,
        integration: Integration,
        config: IntegrationConfig
    ): void {
        (async () => {
            try {
                logMessage('info', `📚 Starting documentation fetch for ${integration.id}`, this.metadata);

                const { DocumentationFetcher } = await import('../../documentation/index.js');
                const docFetcher = new DocumentationFetcher(
                    {
                        urlHost: config.urlHost,
                        urlPath: config.urlPath,
                        documentationUrl: config.documentationUrl,
                    },
                    config.credentials || {},
                    this.metadata
                );

                const docString = await docFetcher.fetchAndProcess();

                // Check if integration still exists
                const stillExists = await datastore.getIntegration({ id: integration.id, includeDocs: false, orgId: this.metadata.orgId });
                if (!stillExists) {
                    logMessage('warn',
                        `Integration ${integration.id} was deleted during documentation fetch`,
                        this.metadata
                    );
                    return;
                }

                // Update with documentation
                await datastore.upsertIntegration({
                    id: integration.id,
                    integration: {
                        ...integration,
                        documentation: docString,
                        documentationPending: false,
                        updatedAt: new Date()
                    },
                    orgId: this.metadata.orgId
                });

                logMessage('info', `✅ Documentation fetched for ${integration.id}`, this.metadata);

            } catch (error) {
                logMessage('error',
                    `❌ Failed to fetch documentation for ${integration.id}: ${error}`,
                    this.metadata
                );

                // Always update documentationPending to false even on failure
                try {
                    const stillExists = await datastore.getIntegration({ id: integration.id, includeDocs: false, orgId: this.metadata.orgId });
                    if (stillExists) {
                        await datastore.upsertIntegration({
                            id: integration.id,
                            integration: {
                                ...integration,
                                documentation: '',
                                documentationPending: false,
                                updatedAt: new Date()
                            },
                            orgId: this.metadata.orgId
                        });
                        logMessage('info', `📝 Marked documentation as processed (failed) for ${integration.id}`, this.metadata);
                    }
                } catch (updateError) {
                    logMessage('error',
                        `❌ Failed to update documentationPending status for ${integration.id}: ${updateError}`,
                        this.metadata
                    );
                }
            }
        })();
    }

    /**
     * Wait for all documentation processing to complete
     */
    private async waitForDocumentation(
        datastore: DataStore,
        pendingIntegrations: string[],
        setupResults: IntegrationSetupResult[]
    ): Promise<number> {
        logMessage('info',
            `⏳ Waiting for documentation processing for ${pendingIntegrations.length} integrations...`,
            this.metadata
        );

        const docStartTime = Date.now();

        try {
            const datastoreAdapter = {
                getIntegration: async (id: string): Promise<Integration | null> => {
                    return await datastore.getIntegration({ id, includeDocs: false, orgId: this.metadata.orgId });
                }
            };

            await waitForIntegrationProcessing(
                datastoreAdapter,
                pendingIntegrations,
                server_defaults.DOCUMENTATION.TIMEOUTS.EVAL_DOC_PROCESSING_TIMEOUT
            );

            const documentationProcessingTime = Date.now() - docStartTime;
            logMessage('info',
                `📚 All documentation processing completed in ${documentationProcessingTime}ms`,
                this.metadata
            );

            // Update setup results with documentation times
            const timePerIntegration = documentationProcessingTime / pendingIntegrations.length;
            for (const integrationId of pendingIntegrations) {
                const result = setupResults.find(r => r.integrationId === integrationId);
                if (result) {
                    result.documentationProcessingTime = timePerIntegration;
                }
            }

            return documentationProcessingTime;

        } catch (error) {
            const documentationProcessingTime = Date.now() - docStartTime;
            logMessage('warn',
                `⚠️  Documentation processing timeout after ${documentationProcessingTime}ms (10 minute limit): ${String(error)}`,
                this.metadata
            );

            // Update all pending integrations to have documentationPending: false
            // to prevent "still being fetched" warnings later
            for (const integrationId of pendingIntegrations) {
                try {
                    const integration = await datastore.getIntegration({ id: integrationId, includeDocs: false, orgId: this.metadata.orgId });
                    if (integration && integration.documentationPending) {
                        await datastore.upsertIntegration({
                            id: integrationId,
                            integration: {
                                ...integration,
                                documentationPending: false,
                                updatedAt: new Date()
                            },
                            orgId: this.metadata.orgId
                        });
                        logMessage('info',
                            `📝 Marked documentation as processed (timeout) for ${integrationId}`,
                            this.metadata
                        );
                    }
                } catch (updateError) {
                    logMessage('error',
                        `❌ Failed to update documentationPending status for ${integrationId}: ${updateError}`,
                        this.metadata
                    );
                }
            }

            return documentationProcessingTime;
        }
    }

    /**
     * Convert IntegrationConfig to Integration object
     */
    private makeIntegrationObject(config: IntegrationConfig): Integration {
        const now = new Date();
        return {
            id: config.id,
            name: config.name,
            urlHost: config.urlHost,
            urlPath: config.urlPath || '',
            documentationUrl: config.documentationUrl || '',
            documentation: '',
            documentationPending: !!(config.documentationUrl && config.documentationUrl.trim() !== ''),
            credentials: config.credentials || {},
            createdAt: now,
            updatedAt: now
        };
    }

    /**
     * Clean up test environment
     */
    async cleanup(): Promise<void> {
        const startTime = Date.now();
        logMessage('info', '🧹 Cleaning up test environment...', this.metadata);

        try {
            if (fs.existsSync(this.testDirPath)) {
                fs.rmSync(this.testDirPath, { recursive: true, force: true });
                logMessage('info', `🗑️  Removed test directory: ${this.testDirPath}`, this.metadata);
            }
        } catch (error) {
            logMessage('warn', `⚠️  Failed to clean up test directory: ${String(error)}`, this.metadata);
        }

        const cleanupTime = Date.now() - startTime;
        logMessage('info', `🧹 Cleanup completed in ${cleanupTime}ms`, this.metadata);
    }

    /**
     * Get current datastore path
     */
    getDatastorePath(): string {
        return this.testDirPath;
    }
} 
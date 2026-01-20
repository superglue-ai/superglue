import { System } from '@superglue/shared';
import { waitForSystemProcessing } from '@superglue/shared/utils';
import fs from 'fs';
import { FileStore } from '@core/datastore/filestore.js';
import { DataStore } from '@core/datastore/types.js';
import { server_defaults } from '@core/default.js';
import { logMessage } from '@core/utils/logs.js';
import { DocumentationFetcher } from '@core/documentation/index.js';
import { SystemConfig } from './config-loader.js';

export interface SetupResult {
    datastore: DataStore;
    systems: System[];
    setupTime: number;
    documentationProcessingTime: number;
    cleanupFunction: () => Promise<void>;
}

export interface SystemSetupResult {
    systemId: string;
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
     * Complete setup for testing: datastore + systems
     */
    async setupTestEnvironment(
        systemConfigs: SystemConfig[]
    ): Promise<SetupResult> {
        const startTime = Date.now();

        // Initialize datastore
        const datastore = await this.initializeDatastore();

        // Setup systems
        const { systems, setupResults, documentationProcessingTime } =
            await this.setupSystems(datastore, systemConfigs);

        const setupTime = Date.now() - startTime;

        logMessage('info', `✅ Test environment setup completed in ${setupTime}ms`, this.metadata);

        return {
            datastore,
            systems,
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
     * Setup systems with documentation processing
     */
    private async setupSystems(
        datastore: DataStore,
        systemConfigs: SystemConfig[]
    ): Promise<{
        systems: System[];
        setupResults: SystemSetupResult[];
        documentationProcessingTime: number;
    }> {
        const startTime = Date.now();
        logMessage('info', `🔧 Setting up ${systemConfigs.length} systems...`, this.metadata);

        const systems: System[] = [];
        const setupResults: SystemSetupResult[] = [];
        const pendingSystems: string[] = [];

        for (const config of systemConfigs) {
            const systemStartTime = Date.now();
            logMessage('info', `⚙️  Setting up system: ${config.name}`, this.metadata);

            try {
                const system = this.makeSystemObject(config);

                // Start async documentation fetch if documentation is pending
                if (system.documentationPending) {
                    this.startDocumentationFetch(
                        datastore,
                        system,
                        config
                    );
                    pendingSystems.push(system.id);
                }

                // Save to datastore
                const saved = await datastore.upsertSystem({
                    id: system.id,
                    system,
                    orgId: this.metadata.orgId
                });

                systems.push(saved);

                const setupTime = Date.now() - systemStartTime;
                setupResults.push({
                    systemId: config.id,
                    name: config.name,
                    setupTime,
                    success: true
                });

                logMessage('info',
                    `✅ System ${config.name} setup in ${setupTime}ms` +
                    (saved.documentationPending ? ' (documentation pending)' : ''),
                    this.metadata
                );

            } catch (error) {
                const setupTime = Date.now() - systemStartTime;
                const errorMsg = error instanceof Error ? error.message : String(error);

                setupResults.push({
                    systemId: config.id,
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
        if (pendingSystems.length > 0) {
            documentationProcessingTime = await this.waitForDocumentation(
                datastore,
                pendingSystems,
                setupResults
            );
        }

        // Refresh systems to get the latest state after documentation processing
        const refreshedSystems: System[] = [];
        for (const system of systems) {
            const updated = await datastore.getSystem({ id: system.id, includeDocs: true, orgId: this.metadata.orgId });
            if (updated) {
                refreshedSystems.push(updated);
            } else {
                // If system was deleted, keep the original
                refreshedSystems.push(system);
            }
        }

        const totalSetupTime = Date.now() - startTime;
        logMessage('info',
            `🔧 System setup completed in ${totalSetupTime}ms ` +
            `(documentation: ${documentationProcessingTime}ms)`,
            this.metadata
        );

        return {
            systems: refreshedSystems,
            setupResults,
            documentationProcessingTime
        };
    }

    /**
     * Start async documentation fetch
     */
    private startDocumentationFetch(
        datastore: DataStore,
        system: System,
        config: SystemConfig
    ): void {
        (async () => {
            try {
                logMessage('info', `📚 Starting documentation fetch for ${system.id}`, this.metadata);

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

                // Check if system still exists
                const stillExists = await datastore.getSystem({ id: system.id, includeDocs: false, orgId: this.metadata.orgId });
                if (!stillExists) {
                    logMessage('warn',
                        `System ${system.id} was deleted during documentation fetch`,
                        this.metadata
                    );
                    return;
                }

                // Update with documentation
                await datastore.upsertSystem({
                    id: system.id,
                    system: {
                        ...system,
                        documentation: docString,
                        documentationPending: false,
                        updatedAt: new Date()
                    },
                    orgId: this.metadata.orgId
                });

                logMessage('info', `✅ Documentation fetched for ${system.id}`, this.metadata);

            } catch (error) {
                logMessage('error',
                    `❌ Failed to fetch documentation for ${system.id}: ${error}`,
                    this.metadata
                );

                // Always update documentationPending to false even on failure
                try {
                    const stillExists = await datastore.getSystem({ id: system.id, includeDocs: false, orgId: this.metadata.orgId });
                    if (stillExists) {
                        await datastore.upsertSystem({
                            id: system.id,
                            system: {
                                ...system,
                                documentation: '',
                                documentationPending: false,
                                updatedAt: new Date()
                            },
                            orgId: this.metadata.orgId
                        });
                        logMessage('info', `📝 Marked documentation as processed (failed) for ${system.id}`, this.metadata);
                    }
                } catch (updateError) {
                    logMessage('error',
                        `❌ Failed to update documentationPending status for ${system.id}: ${updateError}`,
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
        pendingSystems: string[],
        setupResults: SystemSetupResult[]
    ): Promise<number> {
        logMessage('info',
            `⏳ Waiting for documentation processing for ${pendingSystems.length} systems...`,
            this.metadata
        );

        const docStartTime = Date.now();

        try {
            const datastoreAdapter = {
                getSystem: async (id: string): Promise<System | null> => {
                    return await datastore.getSystem({ id, includeDocs: false, orgId: this.metadata.orgId });
                }
            };

            await waitForSystemProcessing(
                datastoreAdapter,
                pendingSystems,
                server_defaults.DOCUMENTATION.TIMEOUTS.EVAL_DOC_PROCESSING_TIMEOUT
            );

            const documentationProcessingTime = Date.now() - docStartTime;
            logMessage('info',
                `📚 All documentation processing completed in ${documentationProcessingTime}ms`,
                this.metadata
            );

            // Update setup results with documentation times
            const timePerSystem = documentationProcessingTime / pendingSystems.length;
            for (const systemId of pendingSystems) {
                const result = setupResults.find(r => r.systemId === systemId);
                if (result) {
                    result.documentationProcessingTime = timePerSystem;
                }
            }

            return documentationProcessingTime;

        } catch (error) {
            const documentationProcessingTime = Date.now() - docStartTime;
            logMessage('warn',
                `⚠️  Documentation processing timeout after ${documentationProcessingTime}ms (10 minute limit): ${String(error)}`,
                this.metadata
            );

            // Update all pending systems to have documentationPending: false
            // to prevent "still being fetched" warnings later
            for (const systemId of pendingSystems) {
                try {
                    const system = await datastore.getSystem({ id: systemId, includeDocs: false, orgId: this.metadata.orgId });
                    if (system && system.documentationPending) {
                        await datastore.upsertSystem({
                            id: systemId,
                            system: {
                                ...system,
                                documentationPending: false,
                                updatedAt: new Date()
                            },
                            orgId: this.metadata.orgId
                        });
                        logMessage('info',
                            `📝 Marked documentation as processed (timeout) for ${systemId}`,
                            this.metadata
                        );
                    }
                } catch (updateError) {
                    logMessage('error',
                        `❌ Failed to update documentationPending status for ${systemId}: ${updateError}`,
                        this.metadata
                    );
                }
            }

            return documentationProcessingTime;
        }
    }

    /**
     * Convert SystemConfig to System object
     */
    private makeSystemObject(config: SystemConfig): System {
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
import * as fs from 'fs';
import * as path from 'path';
import { logMessage } from '@superglue/core/utils/logs.js';

// Common interfaces
export interface IntegrationConfig {
    id: string;
    name: string;
    urlHost: string;
    urlPath?: string;
    documentationUrl?: string;
    credentials: Record<string, string>;
    description: string;
}

export interface BaseWorkflowConfig {
    id: string;
    name: string;
    instruction: string;
    integrationIds: string[];
    payload?: Record<string, any>;
}

// Integration Testing specific
export interface TestWorkflowConfig extends BaseWorkflowConfig {
    integrationIds: string[];
    payload: any;
    complexityLevel: 'low' | 'medium' | 'high';
    category: 'single-system' | 'multi-system';
    expectedKeys?: string[];
    expectedResult?: string; // Can be a description or stringified JSON of expected result
}

export interface IntegrationTestConfig {
    integrations: {
        enabled: string[];
        definitions: Record<string, IntegrationConfig>;
    };
    workflows: {
        enabled: string[];
        definitions: Record<string, TestWorkflowConfig>;
    };
    testSuite: {
        name: string;
        attemptsPerWorkflow?: number;
        delayBetweenAttempts?: number;  // Milliseconds to wait between retry attempts (default: 0)
        enableSoftValidation?: boolean; // Optional, defaults to true
    };
}

// API Ranking specific
export interface ApiRankingWorkflowConfig extends BaseWorkflowConfig {
    // API ranking workflows are simpler
    expectedResult?: string; // Optional expected result for soft validation
}

export interface ApiRankingConfig {
    integrations: Record<string, IntegrationConfig>;
    workflows: Record<string, ApiRankingWorkflowConfig>;
    workflowsToRank: string[];  // Changed from apiRankingWorkflowIds
    settings: {
        attemptsPerWorkflow: number;
        delayBetweenAttempts?: number;  // Milliseconds to wait between retry attempts (default: 0)
        enableSoftValidation?: boolean; // Optional, defaults to false for API ranking
    };
}

export interface CredentialValidationResult {
    isValid: boolean;
    missingEnvVars: string[];
    loadedCredentials: Map<string, Record<string, string>>;
}

export class ConfigLoader {
    private metadata = { orgId: 'config-loader', userId: 'system' };

    /**
     * Load integration test configuration
     */
    async loadIntegrationTestConfig(
        configPath?: string
    ): Promise<IntegrationTestConfig> {
        const defaultPath = path.join(process.cwd(), 'packages/core/eval/integration-testing/integration-test-config.json');
        const finalPath = configPath || defaultPath;

        const config = await this.loadJsonConfig<IntegrationTestConfig>(
            finalPath,
            'integration-test-config.json',
            [
                'packages/core/tests/integration-test-config.json',
                'integration-test-config.json'
            ]
        );

        // Validate structure
        this.validateIntegrationTestConfig(config);

        return config;
    }

    /**
     * Load API ranking configuration
     */
    async loadApiRankingConfig(
        configPath?: string
    ): Promise<ApiRankingConfig> {
        const defaultPath = path.join(process.cwd(), 'packages/core/eval/api-ranking/api-ranking-config.json');
        const finalPath = configPath || defaultPath;

        const config = await this.loadJsonConfig<ApiRankingConfig>(
            finalPath,
            'api-ranking-config.json',
            [
                'packages/core/api-ranking/api-ranking-config.json',
                'api-ranking-config.json'
            ]
        );

        // Validate structure
        this.validateApiRankingConfig(config);

        return config;
    }

    /**
     * Validate and load credentials for integration test config
     */
    validateIntegrationTestCredentials(config: IntegrationTestConfig): CredentialValidationResult {
        const enabledIntegrations = config.integrations.enabled;
        const definitions = config.integrations.definitions;

        return this.validateCredentials(
            enabledIntegrations.map(id => definitions[id]).filter(Boolean)
        );
    }

    /**
     * Validate and load credentials for API ranking config
     */
    validateApiRankingCredentials(config: ApiRankingConfig): CredentialValidationResult {
        // For API ranking, all integrations are considered enabled
        const integrations = Object.values(config.integrations);
        return this.validateCredentials(integrations);
    }

    /**
     * Get enabled integrations from integration test config
     */
    getEnabledIntegrations(config: IntegrationTestConfig): IntegrationConfig[] {
        return config.integrations.enabled
            .map(id => config.integrations.definitions[id])
            .filter((integration): integration is IntegrationConfig => integration !== undefined);
    }

    /**
     * Get enabled workflows from integration test config
     */
    getEnabledWorkflows(config: IntegrationTestConfig): TestWorkflowConfig[] {
        return config.workflows.enabled
            .map(id => config.workflows.definitions[id])
            .filter((workflow): workflow is TestWorkflowConfig => workflow !== undefined);
    }

    /**
     * Get ranking workflows from API ranking config
     */
    getRankingWorkflows(config: ApiRankingConfig): ApiRankingWorkflowConfig[] {
        return config.workflowsToRank
            .map(id => config.workflows[id])
            .filter((workflow): workflow is ApiRankingWorkflowConfig => workflow !== undefined);
    }

    /**
     * Common JSON loading logic
     */
    private async loadJsonConfig<T>(
        providedPath: string,
        defaultFileName: string,
        additionalPaths: string[]
    ): Promise<T> {
        // Determine which eval type based on the filename
        const evalType = defaultFileName.includes('api-ranking') ? 'api-ranking' : 'integration-testing';

        // Try multiple possible paths for the config file
        const possiblePaths = [
            providedPath,
            // When running from root directory
            path.join(process.cwd(), 'packages/core/eval', evalType, defaultFileName),
            // When running from core directory
            path.join(process.cwd(), 'eval', evalType, defaultFileName),
        ];

        let finalConfigPath: string | null = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                finalConfigPath = testPath;
                logMessage('info', `Found config at: ${testPath}`, this.metadata);
                break;
            }
        }

        if (!finalConfigPath) {
            throw new Error(`Could not find ${defaultFileName} in any of: ${possiblePaths.join(', ')}`);
        }

        try {
            const configContent = fs.readFileSync(finalConfigPath, 'utf-8');
            return JSON.parse(configContent);
        } catch (error) {
            throw new Error(`Failed to load config from ${finalConfigPath}: ${String(error)}`);
        }
    }

    /**
     * Validate integration test config structure
     */
    private validateIntegrationTestConfig(config: any): asserts config is IntegrationTestConfig {
        if (!config.integrations?.enabled || !Array.isArray(config.integrations.enabled)) {
            throw new Error('Invalid config: missing integrations.enabled array');
        }
        if (!config.integrations?.definitions || typeof config.integrations.definitions !== 'object') {
            throw new Error('Invalid config: missing integrations.definitions object');
        }
        if (!config.workflows?.enabled || !Array.isArray(config.workflows.enabled)) {
            throw new Error('Invalid config: missing workflows.enabled array');
        }
        if (!config.workflows?.definitions || typeof config.workflows.definitions !== 'object') {
            throw new Error('Invalid config: missing workflows.definitions object');
        }
        if (!config.testSuite?.name) {
            throw new Error('Invalid config: missing testSuite.name');
        }
    }

    /**
     * Validate API ranking config structure
     */
    private validateApiRankingConfig(config: any): asserts config is ApiRankingConfig {
        if (!config.integrations || typeof config.integrations !== 'object') {
            throw new Error('Invalid config: missing integrations object');
        }
        if (!config.workflows || typeof config.workflows !== 'object') {
            throw new Error('Invalid config: missing workflows object');
        }
        if (!config.workflowsToRank || !Array.isArray(config.workflowsToRank)) {
            throw new Error('Invalid config: missing workflowsToRank array');
        }
        if (!config.settings?.attemptsPerWorkflow) {
            throw new Error('Invalid config: missing settings.attemptsPerWorkflow');
        }
    }

    /**
     * Common credential validation logic
     */
    private validateCredentials(integrations: IntegrationConfig[]): CredentialValidationResult {
        const missingEnvVars: string[] = [];
        const loadedCredentials = new Map<string, Record<string, string>>();

        for (const integration of integrations) {
            if (!integration) continue;

            const integrationCredentials: Record<string, string> = {};

            if (!integration.credentials || Object.keys(integration.credentials).length === 0) {
                logMessage('info', `Integration ${integration.id} requires no credentials`, this.metadata);
                loadedCredentials.set(integration.id, {});
                continue;
            }

            // Process each credential key for this integration
            for (const credentialKey of Object.keys(integration.credentials)) {
                // Generate the expected environment variable name
                const envVarName = `${integration.id.toUpperCase().replace(/-/g, '_')}_${credentialKey.toUpperCase()}`;
                const envValue = process.env[envVarName];

                if (envValue) {
                    integrationCredentials[credentialKey] = envValue;
                    logMessage('info', `✓ Found ${envVarName}`, this.metadata);
                } else {
                    // Check if there's a default value in the config
                    const defaultValue = integration.credentials[credentialKey];
                    if (defaultValue && defaultValue !== '') {
                        integrationCredentials[credentialKey] = defaultValue;
                        logMessage('info', `✓ Using default value for ${integration.id}.${credentialKey}`, this.metadata);
                    } else {
                        missingEnvVars.push(envVarName);
                    }
                }
            }

            loadedCredentials.set(integration.id, integrationCredentials);
        }

        return {
            isValid: missingEnvVars.length === 0,
            missingEnvVars,
            loadedCredentials
        };
    }

    /**
     * Apply loaded credentials to integration configs
     */
    applyCredentials(
        integrations: IntegrationConfig[],
        loadedCredentials: Map<string, Record<string, string>>
    ): void {
        for (const integration of integrations) {
            const creds = loadedCredentials.get(integration.id);
            if (creds) {
                integration.credentials = { ...integration.credentials, ...creds };

                // Special handling for postgres connection strings
                if (integration.id === 'postgres-lego' && creds.connection_string) {
                    integration.urlHost = creds.connection_string;
                }
            }
        }
    }
} 
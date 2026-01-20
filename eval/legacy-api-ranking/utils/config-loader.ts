import * as fs from 'fs';
import * as path from 'path';
import { logMessage } from '@superglue/core/utils/logs.js';

// Common interfaces
export interface SystemConfig {
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
    systemIds: string[];
    payload?: Record<string, any>;
}

// System Testing specific
export interface TestWorkflowConfig extends BaseWorkflowConfig {
    systemIds: string[];
    payload: any;
    complexityLevel: 'low' | 'medium' | 'high';
    category: 'single-system' | 'multi-system';
    expectedKeys?: string[];
    expectedResult?: string; // Can be a description or stringified JSON of expected result
}

export interface SystemTestConfig {
    systems: {
        enabled: string[];
        definitions: Record<string, SystemConfig>;
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
    systems: Record<string, SystemConfig>;
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
     * Load system test configuration
     */
    async loadSystemTestConfig(
        configPath?: string
    ): Promise<SystemTestConfig> {
        const defaultPath = path.join(process.cwd(), 'packages/core/eval/system-testing/system-test-config.json');
        const finalPath = configPath || defaultPath;

        const config = await this.loadJsonConfig<SystemTestConfig>(
            finalPath,
            'system-test-config.json',
            [
                'packages/core/tests/system-test-config.json',
                'system-test-config.json'
            ]
        );

        // Validate structure
        this.validateSystemTestConfig(config);

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
     * Validate and load credentials for system test config
     */
    validateSystemTestCredentials(config: SystemTestConfig): CredentialValidationResult {
        const enabledSystems = config.systems.enabled;
        const definitions = config.systems.definitions;

        return this.validateCredentials(
            enabledSystems.map(id => definitions[id]).filter(Boolean)
        );
    }

    /**
     * Validate and load credentials for API ranking config
     */
    validateApiRankingCredentials(config: ApiRankingConfig): CredentialValidationResult {
        // For API ranking, all systems are considered enabled
        const systems = Object.values(config.systems);
        return this.validateCredentials(systems);
    }

    /**
     * Get enabled systems from system test config
     */
    getEnabledSystems(config: SystemTestConfig): SystemConfig[] {
        return config.systems.enabled
            .map(id => config.systems.definitions[id])
            .filter((system): system is SystemConfig => system !== undefined);
    }

    /**
     * Get enabled workflows from system test config
     */
    getEnabledWorkflows(config: SystemTestConfig): TestWorkflowConfig[] {
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
        const evalType = defaultFileName.includes('api-ranking') ? 'api-ranking' : 'system-testing';

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
     * Validate system test config structure
     */
    private validateSystemTestConfig(config: any): asserts config is SystemTestConfig {
        if (!config.systems?.enabled || !Array.isArray(config.systems.enabled)) {
            throw new Error('Invalid config: missing systems.enabled array');
        }
        if (!config.systems?.definitions || typeof config.systems.definitions !== 'object') {
            throw new Error('Invalid config: missing systems.definitions object');
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
        if (!config.systems || typeof config.systems !== 'object') {
            throw new Error('Invalid config: missing systems object');
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
    private validateCredentials(systems: SystemConfig[]): CredentialValidationResult {
        const missingEnvVars: string[] = [];
        const loadedCredentials = new Map<string, Record<string, string>>();

        for (const system of systems) {
            if (!system) continue;

            const systemCredentials: Record<string, string> = {};

            if (!system.credentials || Object.keys(system.credentials).length === 0) {
                logMessage('info', `System ${system.id} requires no credentials`, this.metadata);
                loadedCredentials.set(system.id, {});
                continue;
            }

            // Process each credential key for this system
            for (const credentialKey of Object.keys(system.credentials)) {
                // Generate the expected environment variable name
                const envVarName = `${system.id.toUpperCase().replace(/-/g, '_')}_${credentialKey.toUpperCase()}`;
                const envValue = process.env[envVarName];

                if (envValue) {
                    systemCredentials[credentialKey] = envValue;
                    logMessage('info', `✓ Found ${envVarName}`, this.metadata);
                } else {
                    // Check if there's a default value in the config
                    const defaultValue = system.credentials[credentialKey];
                    if (defaultValue && defaultValue !== '') {
                        systemCredentials[credentialKey] = defaultValue;
                        logMessage('info', `✓ Using default value for ${system.id}.${credentialKey}`, this.metadata);
                    } else {
                        missingEnvVars.push(envVarName);
                    }
                }
            }

            loadedCredentials.set(system.id, systemCredentials);
        }

        return {
            isValid: missingEnvVars.length === 0,
            missingEnvVars,
            loadedCredentials
        };
    }

    /**
     * Apply loaded credentials to system configs
     */
    applyCredentials(
        systems: SystemConfig[],
        loadedCredentials: Map<string, Record<string, string>>
    ): void {
        for (const system of systems) {
            const creds = loadedCredentials.get(system.id);
            if (creds) {
                system.credentials = { ...system.credentials, ...creds };

                // Special handling for postgres connection strings
                if (system.id === 'postgres-lego' && creds.connection_string) {
                    system.urlHost = creds.connection_string;
                }
            }
        }
    }
} 
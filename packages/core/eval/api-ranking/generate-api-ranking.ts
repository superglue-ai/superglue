import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logMessage } from '../../utils/logs.js';
import { ConfigLoader } from '../utils/config-loader.js';
import { SetupManager } from '../utils/setup-manager.js';
import { WorkflowRunner, countApiFailures } from '../utils/workflow-runner.js';
import { DirectLLMEvaluator } from './direct-llm-evaluator.js';

const envPath = process.cwd().endsWith('packages/core')
    ? path.join(process.cwd(), '../../.env')
    : path.join(process.cwd(), '.env');
config({ path: envPath });

interface ApiRankingResult {
    api: string;
    workflowId: string;
    instruction: string;
    successRate: number;
    avgExecutionTime: number;
    avgBuildTime: number;
    totalAttempts: number;
    successfulAttempts: number;
    apiFailureCount: number;
    superglueScore: number;
    softValidation?: {
        success: boolean;
        confidence: number;
        reason: string;
    };
    llmResults: {
        'claude-sonnet-4-20250514': number;
        'claude-opus-4-20250514': number;
        'gpt-4.1': number;
        'o4-mini': number;
        'gemini-2.5-flash': number;
    };
}

async function generateApiRanking(configPath?: string): Promise<void> {
    const originalDataStoreType = process.env.DATA_STORE_TYPE;
    const originalDataStorePath = process.env.DATA_STORE_FILE_PATH;

    process.env.DATA_STORE_TYPE = 'FILE';
    process.env.DATA_STORE_FILE_PATH = './.api-ranking-data';

    const metadata = { orgId: 'api-ranking', userId: 'system' };
    const startTime = Date.now();

    logMessage('info', '🚀 Starting API Ranking Generator', metadata);

    try {
        const configLoader = new ConfigLoader();
        const config = await configLoader.loadApiRankingConfig(configPath);

        const credentialResult = configLoader.validateApiRankingCredentials(config);
        if (!credentialResult.isValid) {
            throw new Error(`Missing credentials: ${credentialResult.missingEnvVars.join(', ')}`);
        }

        const directLLMKeys = DirectLLMEvaluator.validateApiKeys();
        const runDirectLLMEval = directLLMKeys.isValid;

        if (!runDirectLLMEval) {
            logMessage('warn',
                `⚠️  Direct LLM evaluation disabled. Missing API keys: ${directLLMKeys.missing.join(', ')}`,
                metadata
            );
        } else {
            logMessage('info', '✅ Direct LLM evaluation enabled for all models', metadata);
        }

        const integrations = Object.values(config.integrations);
        configLoader.applyCredentials(integrations, credentialResult.loadedCredentials);

        const setupManager = new SetupManager('./.api-ranking-data', 'api-ranking', 'system');
        const setupResult = await setupManager.setupTestEnvironment(integrations);

        const workflowRunner = new WorkflowRunner(setupResult.datastore, 'api-ranking', 'system');
        const directLLMEvaluator = runDirectLLMEval ? new DirectLLMEvaluator() : null;

        const results: ApiRankingResult[] = [];

        const workflows = config.workflowsToRank
            .map(id => config.workflows[id])
            .filter(Boolean);

        logMessage('info', `📊 Running ${workflows.length} workflows for ranking...`, metadata);
        logMessage('info', `Workflow IDs to rank: ${config.workflowsToRank.join(', ')}`, metadata);

        for (const workflow of workflows) {
            const workflowIntegrations = setupResult.integrations.filter(i =>
                workflow.integrationIds.includes(i.id)
            );

            // Run Superglue evaluation
            const runResult = await workflowRunner.runWorkflow(
                workflow,
                workflowIntegrations,
                {
                    maxAttemptsPerWorkflow: config.settings.attemptsPerWorkflow,
                    collectLogs: true,
                    saveRuns: false,
                    delayBetweenAttempts: config.settings.delayBetweenAttempts || 0,
                    enableSoftValidation: config.settings.enableSoftValidation || false, 
                    expectedResult: workflow.expectedResult 
                }
            );

            const apiFailureCount = countApiFailures(runResult.collectedLogs);

            logMessage('info',
                `📊 Workflow ${workflow.name} - API failures: ${apiFailureCount}, Success rate: ${(runResult.successRate * 100).toFixed(0)}%`,
                metadata
            );

            const successfulAttempts = runResult.attempts.filter(a => a.executionSuccess);
            const avgExecutionTime = successfulAttempts.length > 0
                ? successfulAttempts.reduce((sum, a) => sum + a.executionTime, 0) / successfulAttempts.length
                : Infinity;
            const avgBuildTime = runResult.attempts.reduce((sum, a) => sum + a.buildTime, 0) / runResult.attempts.length;

            const llmResults = {
                'claude-sonnet-4-20250514': 0,
                'claude-opus-4-20250514': 0,
                'gpt-4.1': 0,
                'o4-mini': 0,
                'gemini-2.5-flash': 0
            };

            if (directLLMEvaluator) {
                logMessage('info', `🤖 Running direct LLM evaluation for ${workflow.name}...`, metadata);

                try {
                    const directLLMResults = await directLLMEvaluator.evaluateWorkflow(
                        workflow,
                        workflowIntegrations,
                        config.settings.attemptsPerWorkflow
                    );

                    // Extract success rates for each model
                    for (const [model, result] of Object.entries(directLLMResults)) {
                        llmResults[model as keyof typeof llmResults] = result.successRate;
                    }

                    // Log results for each model
                    const modelResults = Object.entries(llmResults)
                        .map(([model, rate]) => `${model}: ${(rate * 100).toFixed(0)}%`)
                        .join(', ');

                    logMessage('info',
                        `📊 Direct LLM results - ${modelResults}`,
                        metadata
                    );
                } catch (error) {
                    logMessage('error',
                        `❌ Direct LLM evaluation failed for ${workflow.name}: ${error}`,
                        metadata
                    );
                }
            }

            const primaryIntegration = workflowIntegrations[0];
            const apiName = primaryIntegration?.name || workflow.integrationIds[0];

            results.push({
                api: apiName,
                workflowId: workflow.id,
                instruction: workflow.instruction,
                successRate: runResult.successRate,
                avgExecutionTime,
                avgBuildTime,
                totalAttempts: runResult.totalAttempts,
                successfulAttempts: runResult.successfulAttempts,
                apiFailureCount,
                superglueScore: calculateAverageScore(runResult.successRate, llmResults),
                llmResults
            });
        }

        results.sort((a, b) => b.superglueScore - a.superglueScore);

        const csvPath = path.join(process.cwd(), 'eval/api-ranking/ranking.csv');
        await generateRankingCsv(results, csvPath);

        await setupResult.cleanupFunction();

        const totalTime = Date.now() - startTime;
        logMessage('info', `✅ API Ranking completed in ${totalTime}ms`, metadata);
        logMessage('info', `📄 Results saved to: ${csvPath}`, metadata);

    } catch (error) {
        logMessage('error', `❌ API Ranking failed: ${error}`, metadata);
        throw error;
    } finally {
        // Restore original environment variables
        if (originalDataStoreType !== undefined) {
            process.env.DATA_STORE_TYPE = originalDataStoreType;
        } else {
            delete process.env.DATA_STORE_TYPE;
        }

        if (originalDataStorePath !== undefined) {
            process.env.DATA_STORE_FILE_PATH = originalDataStorePath;
        } else {
            delete process.env.DATA_STORE_FILE_PATH;
        }
    }
}

/**
 * Calculate Average Score based on all success rates (Superglue + LLM models)
 */
function calculateAverageScore(
    superglueSuccessRate: number,
    llmResults: {
        'claude-sonnet-4-20250514': number;
        'claude-opus-4-20250514': number;
        'gpt-4.1': number;
        'o4-mini': number;
        'gemini-2.5-flash': number;
    }
): number {
    // Collect all success rates
    const allRates = [
        superglueSuccessRate,
        ...Object.values(llmResults)
    ];

    // Calculate average
    const sum = allRates.reduce((acc, rate) => acc + rate, 0);
    return sum / allRates.length;
}

/**
 * Generate the ranking CSV file
 */
async function generateRankingCsv(results: ApiRankingResult[], outputPath: string): Promise<void> {
    const headers = [
        'Rank',
        'API',
        'Average Score',
        'Superglue Success %',
        'Claude Sonnet 4',
        'Claude Opus 4',
        'GPT-4.1',
        'O4 Mini',
        'Gemini 2.5 Flash',
        'Instruction Prompt'
    ];

    const rows = results.map((result, index) => {
        return [
            index + 1, // Rank
            result.api, // API name
            result.superglueScore.toFixed(2), // Score
            `${(result.successRate * 100).toFixed(0)}%`, // Superglue Success %
            `${(result.llmResults['claude-sonnet-4-20250514'] * 100).toFixed(0)}%`, // Claude Sonnet
            `${(result.llmResults['claude-opus-4-20250514'] * 100).toFixed(0)}%`, // Claude Opus
            `${(result.llmResults['gpt-4.1'] * 100).toFixed(0)}%`, // GPT-4.1
            `${(result.llmResults['o4-mini'] * 100).toFixed(0)}%`, // O4 Mini
            `${(result.llmResults['gemini-2.5-flash'] * 100).toFixed(0)}%`, // Gemini 2.5 Flash
            `"${result.instruction.replace(/"/g, '""')}"` // Escape quotes in instruction
        ];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    await fs.promises.writeFile(outputPath, csvContent, 'utf-8');
}

// Run the generator
generateApiRanking()
    .then(() => {
        console.log('✅ API Ranking generation completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ API Ranking generation failed:', error);
        process.exit(1);
    }); 
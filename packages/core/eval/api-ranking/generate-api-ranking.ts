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
    chatgptSuccessRate: number;
    claudeSuccessRate: number;
}

async function generateApiRanking(configPath?: string): Promise<void> {
    // Set environment variables only within this function scope
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
            logMessage('info', '✅ Direct LLM evaluation enabled (ChatGPT & Claude)', metadata);
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

            const runResult = await workflowRunner.runWorkflow(
                workflow,
                workflowIntegrations,
                {
                    maxAttemptsPerWorkflow: config.settings.attemptsPerWorkflow,
                    collectLogs: true,  // Enable log collection
                    saveRuns: false,
                    delayBetweenAttempts: 1000
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


            let chatgptSuccessRate = 0;
            let claudeSuccessRate = 0;

            if (directLLMEvaluator) {
                logMessage('info', `🤖 Running direct LLM evaluation for ${workflow.name}...`, metadata);

                try {
                    const directLLMResults = await directLLMEvaluator.evaluateWorkflow(
                        workflow,
                        workflowIntegrations,
                        config.settings.attemptsPerWorkflow
                    );

                    chatgptSuccessRate = directLLMResults.chatgpt.successRate;
                    claudeSuccessRate = directLLMResults.claude.successRate;

                    logMessage('info',
                        `📊 Direct LLM results - ChatGPT: ${(chatgptSuccessRate * 100).toFixed(0)}%, Claude: ${(claudeSuccessRate * 100).toFixed(0)}%`,
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
                superglueScore: calculateSuperglueScore(runResult.successRate, avgExecutionTime, apiFailureCount),
                chatgptSuccessRate,
                claudeSuccessRate
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
 * Calculate Superglue Score based on success rate, execution time, and API reliability
 */
function calculateSuperglueScore(
    successRate: number,
    avgExecutionTime: number,
    apiFailureCount: number
): number {
    // Base score is success rate (0-1)
    let score = successRate;

    // Apply penalties only if there was some success
    if (successRate > 0) {
        // API failure penalty: each failed API call reduces score by 0.02 (max penalty: 0.2)
        const apiFailurePenalty = Math.min(0.2, apiFailureCount * 0.02);
        score -= apiFailurePenalty;

        // Time penalty for execution (not build time)
        if (avgExecutionTime < Infinity) {
            // Fast workflows (< 1s) get no penalty
            // Slow workflows (> 10s) get max penalty of 0.1
            const timePenalty = Math.min(0.1, Math.max(0, (avgExecutionTime - 1000) / 90000));
            score -= timePenalty;
        }
    } else {
        // Failed workflows get minimal scores
        // Base score of 0.1 or 0.2 depending on whether they got far enough to make API calls
        score = apiFailureCount > 0 ? 0.2 : 0.1;
    }

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
}

/**
 * Generate the ranking CSV file
 */
async function generateRankingCsv(results: ApiRankingResult[], outputPath: string): Promise<void> {
    const headers = ['Rank', 'API', 'Superglue Score', 'Superglue Success %', 'API Failures', 'ChatGPT Success %', 'Claude Success %', 'Instruction Prompt'];

    const rows = results.map((result, index) => {
        return [
            index + 1, // Rank
            result.api, // API name
            result.superglueScore.toFixed(2), // Score
            `${(result.successRate * 100).toFixed(0)}%`, // Superglue Success %
            result.apiFailureCount, // API Failures
            `${(result.chatgptSuccessRate * 100).toFixed(0)}%`, // ChatGPT Success %
            `${(result.claudeSuccessRate * 100).toFixed(0)}%`, // Claude Success %
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
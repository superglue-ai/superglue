#!/usr/bin/env node
// API Ranking Generator - Generates performance rankings for various APIs

import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logMessage } from '../../utils/logs.js';
import { ConfigLoader, SetupManager, WorkflowRunner } from '../utils/index.js';
import { CompetitorEvaluator } from './competitor-evaluator.js';

// Load environment variables
const envPath = process.cwd().endsWith('packages/core')
    ? path.join(process.cwd(), '../../.env')
    : path.join(process.cwd(), '.env');
config({ path: envPath });

// Set file-based datastore
process.env.DATA_STORE_TYPE = 'FILE';
process.env.DATA_STORE_FILE_PATH = './.api-ranking-data';

interface ApiRankingResult {
    api: string;
    workflowId: string;
    instruction: string;
    successRate: number;
    avgExecutionTime: number;
    avgBuildTime: number;
    totalAttempts: number;
    successfulAttempts: number;
    superglueScore: number;
    chatgptSuccessRate: number;
    claudeSuccessRate: number;
}

async function generateApiRanking(configPath?: string): Promise<void> {
    const metadata = { orgId: 'api-ranking', userId: 'system' };
    const startTime = Date.now();

    logMessage('info', '🚀 Starting API Ranking Generator', metadata);

    try {
        // 1. Load configuration
        const configLoader = new ConfigLoader();
        const config = await configLoader.loadApiRankingConfig(configPath);

        // Validate credentials
        const credentialResult = configLoader.validateApiRankingCredentials(config);
        if (!credentialResult.isValid) {
            throw new Error(`Missing credentials: ${credentialResult.missingEnvVars.join(', ')}`);
        }

        // Check competitor API keys
        const competitorKeys = CompetitorEvaluator.validateApiKeys();
        const runCompetitorEval = competitorKeys.isValid;

        if (!runCompetitorEval) {
            logMessage('warn',
                `⚠️  Competitor evaluation disabled. Missing API keys: ${competitorKeys.missing.join(', ')}`,
                metadata
            );
        } else {
            logMessage('info', '✅ Competitor evaluation enabled (ChatGPT & Claude)', metadata);
        }

        // Apply credentials
        const integrations = Object.values(config.integrations);
        configLoader.applyCredentials(integrations, credentialResult.loadedCredentials);

        // 2. Setup test environment
        const setupManager = new SetupManager('./.api-ranking-data', 'api-ranking', 'system');
        const setupResult = await setupManager.setupTestEnvironment(integrations);

        // 3. Initialize evaluators
        const workflowRunner = new WorkflowRunner(setupResult.datastore, 'api-ranking', 'system');
        const competitorEvaluator = runCompetitorEval ? new CompetitorEvaluator() : null;

        // 4. Run workflows and collect results
        const results: ApiRankingResult[] = [];

        // Get workflows to rank
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
                    collectLogs: false,
                    saveRuns: false,
                    delayBetweenAttempts: 1000
                }
            );

            // Calculate Superglue metrics
            const successfulAttempts = runResult.attempts.filter(a => a.executionSuccess);
            const avgExecutionTime = successfulAttempts.length > 0
                ? successfulAttempts.reduce((sum, a) => sum + a.executionTime, 0) / successfulAttempts.length
                : Infinity;
            const avgBuildTime = runResult.attempts.reduce((sum, a) => sum + a.buildTime, 0) / runResult.attempts.length;

            // Run competitor evaluations if API keys are available
            let chatgptSuccessRate = 0;
            let claudeSuccessRate = 0;

            if (competitorEvaluator) {
                logMessage('info', `🤖 Running competitor evaluation for ${workflow.name}...`, metadata);

                try {
                    const competitorResults = await competitorEvaluator.evaluateWorkflow(
                        workflow,
                        workflowIntegrations,
                        config.settings.attemptsPerWorkflow
                    );

                    chatgptSuccessRate = competitorResults.chatgpt.successRate;
                    claudeSuccessRate = competitorResults.claude.successRate;

                    logMessage('info',
                        `📊 Competitor results - ChatGPT: ${(chatgptSuccessRate * 100).toFixed(0)}%, Claude: ${(claudeSuccessRate * 100).toFixed(0)}%`,
                        metadata
                    );
                } catch (error) {
                    logMessage('error',
                        `❌ Competitor evaluation failed for ${workflow.name}: ${error}`,
                        metadata
                    );
                }
            }

            // Get the primary integration (first one)
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
                superglueScore: calculateSuperglueScore(runResult.successRate, avgExecutionTime, avgBuildTime),
                chatgptSuccessRate,
                claudeSuccessRate
            });
        }

        // 5. Sort by score and generate rankings
        results.sort((a, b) => b.superglueScore - a.superglueScore);

        // 6. Generate CSV
        const csvPath = path.join(process.cwd(), 'eval/api-ranking/ranking.csv');
        await generateRankingCsv(results, csvPath);

        // 7. Cleanup
        await setupResult.cleanupFunction();

        const totalTime = Date.now() - startTime;
        logMessage('info', `✅ API Ranking completed in ${totalTime}ms`, metadata);
        logMessage('info', `📄 Results saved to: ${csvPath}`, metadata);

    } catch (error) {
        logMessage('error', `❌ API Ranking failed: ${error}`, metadata);
        throw error;
    }
}

/**
 * Calculate Superglue Score based on success rate and performance
 */
function calculateSuperglueScore(
    successRate: number,
    avgExecutionTime: number,
    avgBuildTime: number
): number {
    // Base score is success rate (0-1)
    let score = successRate;

    // Apply time penalties (normalized to reduce score by up to 0.1)
    const totalTime = avgExecutionTime + avgBuildTime;

    if (successRate > 0 && totalTime < Infinity) {
        // Fast workflows (< 1s) get no penalty
        // Slow workflows (> 10s) get max penalty
        const timePenalty = Math.min(0.1, Math.max(0, (totalTime - 1000) / 90000));
        score -= timePenalty;
    } else if (successRate === 0) {
        // Failed workflows get a base score based on how far they got
        score = avgBuildTime > 0 ? 0.2 : 0.1; // Built but failed execution vs didn't build
    }

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
}

/**
 * Generate the ranking CSV file
 */
async function generateRankingCsv(results: ApiRankingResult[], outputPath: string): Promise<void> {
    const headers = ['Rank', 'API', 'Superglue Score', 'Superglue Success %', 'ChatGPT Success %', 'Claude Success %', 'Instruction Prompt'];

    const rows = results.map((result, index) => {
        return [
            index + 1, // Rank
            result.api, // API name
            result.superglueScore.toFixed(2), // Score
            `${(result.successRate * 100).toFixed(0)}%`, // Superglue Success %
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
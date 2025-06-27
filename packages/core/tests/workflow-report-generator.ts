import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logMessage } from "../utils/logs.js";
// LanguageModel will be imported dynamically to ensure env vars are loaded first

interface BuildAttempt {
    buildTime: number;
    success: boolean;
    error?: string;
}

interface ExecutionAttempt {
    executionTime: number;
    success: boolean;
    error?: string;
}

interface WorkflowPlan {
    id?: string;
    instruction?: string;
    integrationIds?: string[];
    steps?: Array<{
        id: string;
        executionMode?: string;
        apiConfig?: {
            method?: string;
            urlHost?: string;
            urlPath?: string;
            instruction?: string;
        };
        inputMapping?: string;
        responseMapping?: string;
        integrationId?: string;
    }>;
    finalTransform?: string;
}

interface WorkflowExecutionReport {
    workflowId: string;
    workflowName: string;
    overallSuccess: boolean;
    totalAttempts: number;

    // Simplified analysis - just the key insights, no artificial status categories
    planningIssues: string[];
    apiIssues: string[];
    integrationIssues: string[];
    dataIssues: string[];

    // Summary and recommendations
    primaryFailureCategory?: 'planning' | 'api_understanding' | 'integration_config' | 'data_mapping' | 'execution_environment';
    recommendations: string[];
    executionSummary: string;
}

// Zod schema for structured LLM output
const WorkflowExecutionReportSchema = z.object({
    planningIssues: z.array(z.string()).describe("Specific issues with workflow planning and step generation"),
    apiIssues: z.array(z.string()).describe("Specific issues with API calls, endpoints, or responses"),
    integrationIssues: z.array(z.string()).describe("Specific issues with authentication, credentials, or integration setup"),
    dataIssues: z.array(z.string()).describe("Specific issues with data mapping, transformations, or schema problems"),
    primaryFailureCategory: z.enum(['planning', 'api_understanding', 'integration_config', 'data_mapping', 'execution_environment']).nullable().describe("The main category that caused the failure, or null if successful"),
    recommendations: z.array(z.string()).describe("Specific actionable recommendations to fix the issues"),
    executionSummary: z.string().describe("A concise 2-3 sentence summary of what happened and the outcome")
});

interface ErrorAnalysisInput {
    workflowId: string;
    workflowName: string;
    originalInstruction: string;
    buildAttempts: BuildAttempt[];
    executionAttempts: ExecutionAttempt[];
    workflowPlans?: Array<{
        plan: WorkflowPlan;
        buildSuccess: boolean;
        executionSuccess: boolean;
        attemptNumber: number;
    }>;
    integrationIds: string[];
    payload?: Record<string, any>;
    expectedKeys?: string[];
    actualData?: any; // The actual data returned by the workflow
}

/**
 * WorkflowReportGenerator - AI-powered diagnostic and reporting tool for workflows
 * 
 * Analyzes workflow build and execution by examining:
 * - Generated workflow plans and their success/failure patterns
 * - Build vs execution error categorization  
 * - Integration mapping and data flow issues
 * - Root cause analysis (planning vs execution vs configuration)
 * - Detailed performance breakdown across all categories
 * 
 * Provides actionable insights and comprehensive reports for workflow analysis.
 */
export class WorkflowReportGenerator {

    /**
     * Generates an AI-powered error summary for a workflow that encountered issues
     */
    async generateErrorSummary(input: ErrorAnalysisInput): Promise<string | undefined> {
        const { buildAttempts, executionAttempts, workflowPlans } = input;

        // Extract all errors from attempts
        const buildErrors = buildAttempts.filter(b => !b.success && b.error).map(b => b.error);
        const execErrors = executionAttempts.filter(e => !e.success && e.error).map(e => e.error);
        const allErrors = [...buildErrors, ...execErrors];

        if (allErrors.length === 0) return undefined;

        try {
            const prompt = this.buildAnalysisPrompt(input, allErrors);

            const { LanguageModel } = await import('../llm/llm.js');
            const response = await LanguageModel.generateText([
                { role: 'user', content: prompt }
            ], 0.3);

            return response.response;
        } catch (error) {
            const errorMessage = String(error);
            logMessage('warn', `🔍 WorkflowReportGenerator Debug - Error in generateErrorSummary for ${input.workflowId}:`);
            logMessage('warn', `   LLM_PROVIDER: "${process.env.LLM_PROVIDER || 'not set'}"`);
            logMessage('warn', `   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? `SET (length: ${process.env.OPENAI_API_KEY.length}, starts: ${process.env.OPENAI_API_KEY.substring(0, 7)}...)` : 'NOT SET'}`);
            logMessage('warn', `   OPENAI_MODEL: "${process.env.OPENAI_MODEL || 'not set'}"`);
            logMessage('warn', `   Error message: "${errorMessage}"`);
            logMessage('warn', `   Full error: ${JSON.stringify(error, null, 2)}`);

            if (errorMessage.includes('401') || errorMessage.includes('API key') || errorMessage.includes('Unauthorized')) {
                logMessage('warn', `❌ LLM API credentials issue for workflow ${input.workflowId}. Using fallback mode.`);
                return `AI analysis unavailable: LLM API authentication failed. Error count: ${allErrors.length} (${buildErrors.length} build, ${execErrors.length} execution)`;
            }
            logMessage('warn', `Failed to generate error summary for workflow ${input.workflowId}: ${error}`);
            return undefined;
        }
    }

    /**
     * Builds the analysis prompt with all relevant context
     */
    private buildAnalysisPrompt(input: ErrorAnalysisInput, allErrors: (string | undefined)[]): string {
        const {
            originalInstruction,
            workflowPlans,
            buildAttempts,
            executionAttempts,
            integrationIds,
            payload,
            expectedKeys
        } = input;

        // Format workflow plans for analysis
        const planAnalysis = workflowPlans?.map((planData, index) => {
            const { plan, buildSuccess, executionSuccess, attemptNumber } = planData;

            const planSummary = this.formatWorkflowPlan(plan);
            const outcome = buildSuccess && executionSuccess ? 'SUCCESS' :
                buildSuccess ? 'BUILD_SUCCESS_EXECUTION_FAILED' : 'BUILD_FAILED';

            return `
ATTEMPT ${attemptNumber} (${outcome}):
${planSummary}`;
        }).join('\n') || 'No workflow plans generated';

        return `Analyze this workflow execution failure and provide actionable insights:

ORIGINAL INSTRUCTION: "${originalInstruction}"

INTEGRATION IDS: [${integrationIds.join(', ')}]
PAYLOAD: ${JSON.stringify(payload || {}, null, 2)}
EXPECTED OUTPUT KEYS: [${expectedKeys?.join(', ') || 'none specified'}]

WORKFLOW PLANS GENERATED:
${planAnalysis}

BUILD ERRORS (${buildAttempts.filter(b => !b.success).length} failures):
${buildAttempts.filter(b => !b.success).map((b, i) => `${i + 1}. ${b.error || 'Unknown build error'}`).join('\n')}

EXECUTION ERRORS (${executionAttempts.filter(e => !e.success).length} failures):
${executionAttempts.filter(e => !e.success).map((e, i) => `${i + 1}. ${e.error || 'Unknown execution error'}`).join('\n')}

ANALYSIS FRAMEWORK:
1. **Planning Quality**: Were the generated workflow plans logical and appropriate for the instruction?
2. **Integration Mapping**: Were the right integrations selected and used correctly?
3. **Execution Issues**: Were failures due to auth, network, data format, or API-specific problems?
4. **Data Flow**: Were input/output mappings and transformations correct?
5. **Root Cause**: What's the primary failure category?

Provide a concise 2-3 sentence diagnosis focusing on:
- Whether this was a planning failure (wrong steps/APIs) or execution failure (auth/network/data)
- The most likely root cause and specific fix needed
- Any patterns across multiple attempts that suggest systemic issues`;
    }

    /**
     * Formats a workflow plan for readable analysis
     */
    private formatWorkflowPlan(plan: WorkflowPlan): string {
        if (!plan.steps || plan.steps.length === 0) {
            return "No workflow steps generated";
        }

        const stepsDescription = plan.steps.map((step, i) => {
            const api = step.apiConfig;
            return `  ${i + 1}. ${step.id || 'unnamed'} (${step.executionMode || 'unknown'})
     Integration: ${step.integrationId || 'none'}
     API: ${api?.method || '?'} ${api?.urlHost || '?'}${api?.urlPath || ''}
     Purpose: ${api?.instruction || 'no description'}
     Input: ${step.inputMapping || 'none'}
     Output: ${step.responseMapping || 'none'}`;
        }).join('\n');

        return `Steps: ${plan.steps.length}
Integration IDs: [${plan.integrationIds?.join(', ') || 'none'}]
Final Transform: ${plan.finalTransform || 'none'}
Generated Steps:
${stepsDescription}`;
    }

    /**
     * Analyzes multiple workflow results and provides aggregate insights
     */
    async generateSuiteAnalysis(results: Array<{
        workflowName: string;
        succeeded: boolean;
        errorSummary?: string;
        complexity: string;
        category: string;
    }>): Promise<string> {
        const failed = results.filter(r => !r.succeeded);
        const succeeded = results.filter(r => r.succeeded);

        if (failed.length === 0) {
            return "All workflows executed successfully - no systemic issues detected.";
        }

        const prompt = `Analyze these workflow execution results for systemic patterns:

FAILED WORKFLOWS (${failed.length}):
${failed.map(r => `- ${r.workflowName} (${r.complexity}/${r.category}): ${r.errorSummary || 'No analysis available'}`).join('\n')}

SUCCESSFUL WORKFLOWS (${succeeded.length}):
${succeeded.map(r => `- ${r.workflowName} (${r.complexity}/${r.category})`).join('\n')}

Identify any patterns across failures:
1. Are failures concentrated in specific complexity levels or categories?
2. Are there common root causes (auth, planning, data flow)?
3. What systemic improvements would prevent these failures?

Provide 2-3 sentences highlighting the most important patterns and recommendations.`;

        try {
            const { LanguageModel } = await import('../llm/llm.js');
            const response = await LanguageModel.generateText([
                { role: 'user', content: prompt }
            ], 0.3);

            return response.response;
        } catch (error) {
            const errorMessage = String(error);
            if (errorMessage.includes('401') || errorMessage.includes('API key')) {
                logMessage('warn', `❌ LLM API credentials missing for suite analysis. Using fallback mode.`);
                return `Suite analysis unavailable: LLM API credentials not configured. ${failed.length}/${results.length} workflows failed. Manual review recommended.`;
            }
            logMessage('warn', `Failed to generate suite analysis: ${error}`);
            return "Unable to generate aggregate analysis due to AI service error.";
        }
    }

    /**
     * Generates a detailed execution report analyzing Superglue's performance across all categories
     */
    async generateWorkflowExecutionReport(input: ErrorAnalysisInput): Promise<WorkflowExecutionReport> {
        const {
            workflowId,
            workflowName,
            originalInstruction,
            buildAttempts,
            executionAttempts,
            workflowPlans = [],
            integrationIds,
            payload,
            expectedKeys
        } = input;

        const overallSuccess = buildAttempts.some(b => b.success) && executionAttempts.some(e => e.success);
        const totalAttempts = Math.max(buildAttempts.length, 1);

        // Extract all errors for analysis
        const buildErrors = buildAttempts.filter(b => !b.success && b.error).map(b => b.error);
        const execErrors = executionAttempts.filter(e => !e.success && e.error).map(e => e.error);
        const allErrors = [...buildErrors, ...execErrors];

        // Format workflow plans for analysis
        const planAnalysis = workflowPlans.map((planData, index) => {
            const { plan, buildSuccess, executionSuccess, attemptNumber } = planData;
            const planSummary = this.formatWorkflowPlan(plan);
            const outcome = buildSuccess && executionSuccess ? 'SUCCESS' :
                buildSuccess ? 'BUILD_SUCCESS_EXECUTION_FAILED' : 'BUILD_FAILED';

            return `ATTEMPT ${attemptNumber} (${outcome}): ${planSummary}`;
        }).join('\n\n') || 'No workflow plans available';

        const prompt = `Analyze this Superglue workflow execution and identify specific issues:

WORKFLOW: "${workflowName}"
INSTRUCTION: "${originalInstruction}"
INTEGRATION IDS: [${integrationIds.join(', ')}]
PAYLOAD: ${JSON.stringify(payload || {}, null, 2)}
EXPECTED OUTPUT: [${expectedKeys?.join(', ') || 'none specified'}]
ACTUAL OUTPUT: ${input.actualData ? JSON.stringify(Object.keys(input.actualData), null, 2) : 'No data returned'}
OVERALL SUCCESS: ${overallSuccess}
TOTAL ATTEMPTS: ${totalAttempts}

WORKFLOW PLANS GENERATED:
${planAnalysis}

BUILD ERRORS (${buildErrors.length}):
${buildErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None'}

EXECUTION ERRORS (${execErrors.length}):
${execErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None'}

Analyze the workflow execution and identify specific issues in these categories:

1. PLANNING ISSUES: Problems with understanding the instruction or generating appropriate workflow steps
2. API ISSUES: Problems with API calls, endpoints, HTTP methods, request/response handling
3. INTEGRATION ISSUES: Problems with authentication, credentials, or integration configuration
4. DATA ISSUES: Problems with data mapping, JSONata transformations, schema mismatches, or data format issues

For each category, list specific concrete issues found (empty array if no issues).
Provide actionable recommendations to fix the problems.
Summarize what happened in 2-3 sentences.`;

        try {
            const { LanguageModel } = await import('../llm/llm.js');
            const response = await LanguageModel.generateObject([
                { role: 'user', content: prompt }
            ], zodToJsonSchema(WorkflowExecutionReportSchema), 0.2);

            return {
                workflowId,
                workflowName,
                overallSuccess,
                totalAttempts,
                planningIssues: response.response.planningIssues,
                apiIssues: response.response.apiIssues,
                integrationIssues: response.response.integrationIssues,
                dataIssues: response.response.dataIssues,
                primaryFailureCategory: response.response.primaryFailureCategory,
                recommendations: response.response.recommendations,
                executionSummary: response.response.executionSummary
            };
        } catch (error) {
            const errorMessage = String(error);
            logMessage('warn', `🔍 WorkflowReportGenerator Debug - Error in generateWorkflowExecutionReport for ${workflowId}:`);
            logMessage('warn', `   LLM_PROVIDER: "${process.env.LLM_PROVIDER || 'not set'}"`);
            logMessage('warn', `   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? `SET (length: ${process.env.OPENAI_API_KEY.length}, starts: ${process.env.OPENAI_API_KEY.substring(0, 7)}...)` : 'NOT SET'}`);
            logMessage('warn', `   OPENAI_MODEL: "${process.env.OPENAI_MODEL || 'not set'}"`);
            logMessage('warn', `   Error message: "${errorMessage}"`);
            logMessage('warn', `   Full error: ${JSON.stringify(error, null, 2)}`);

            if (errorMessage.includes('401') || errorMessage.includes('API key')) {
                logMessage('warn', `❌ LLM API credentials issue for workflow ${workflowId}. Using fallback mode.`);

                // Return a more informative fallback report
                return {
                    workflowId,
                    workflowName,
                    overallSuccess,
                    totalAttempts,
                    planningIssues: [],
                    apiIssues: [],
                    integrationIssues: [],
                    dataIssues: [],
                    primaryFailureCategory: null,
                    recommendations: [
                        'Set OPENAI_API_KEY or GEMINI_API_KEY environment variable for AI-powered analysis',
                        'Manual review needed due to missing LLM credentials'
                    ],
                    executionSummary: `Workflow ${overallSuccess ? 'succeeded' : 'failed'} after ${totalAttempts} attempts. AI analysis unavailable due to missing LLM API credentials.`
                };
            }

            logMessage('warn', `Failed to generate workflow execution report for ${workflowId}: ${error}`);

            // Return a fallback report
            return {
                workflowId,
                workflowName,
                overallSuccess,
                totalAttempts,
                planningIssues: [],
                apiIssues: [],
                integrationIssues: [],
                dataIssues: [],
                primaryFailureCategory: null,
                recommendations: ['Manual review needed due to analysis error'],
                executionSummary: 'Detailed analysis could not be completed due to a processing error.'
            };
        }
    }
} 
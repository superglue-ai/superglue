import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logMessage } from "../utils/logs.js";

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
     * Truncates a string to a maximum length, adding ellipsis if truncated
     */
    private truncateString(str: string, maxLength: number = 200): string {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    /**
     * Deduplicates error messages based on their prefix
     */
    private deduplicateErrors(errors: (string | undefined)[], prefixLength: number = 100): string[] {
        const seen = new Set<string>();
        const deduplicated: string[] = [];

        for (const error of errors) {
            if (!error) continue;
            const prefix = error.substring(0, prefixLength);
            if (!seen.has(prefix)) {
                seen.add(prefix);
                deduplicated.push(this.truncateString(error, 300));
            }
        }

        return deduplicated;
    }

    /**
     * Simplifies workflow plan for prompt by removing verbose fields
     */
    private simplifyWorkflowPlan(plan: WorkflowPlan): any {
        if (!plan.steps || plan.steps.length === 0) {
            return { steps: [] };
        }

        return {
            id: plan.id,
            steps: plan.steps.map(step => ({
                id: step.id,
                integrationId: step.integrationId,
                executionMode: step.executionMode,
                apiConfig: step.apiConfig ? {
                    method: step.apiConfig.method,
                    urlHost: step.apiConfig.urlHost,
                    urlPath: step.apiConfig.urlPath,
                    instruction: step.apiConfig.instruction ? this.truncateString(step.apiConfig.instruction, 100) : undefined
                } : undefined
            }))
        };
    }

    /**
     * Batch analyzes all attempts for a workflow together (optimized version)
     */
    async generateBatchErrorSummary(input: ErrorAnalysisInput): Promise<string | undefined> {
        const { buildAttempts, executionAttempts, workflowPlans } = input;

        // Extract and deduplicate errors
        const buildErrors = buildAttempts.filter(b => !b.success && b.error).map(b => b.error);
        const execErrors = executionAttempts.filter(e => !e.success && e.error).map(e => e.error);

        const uniqueBuildErrors = this.deduplicateErrors(buildErrors);
        const uniqueExecErrors = this.deduplicateErrors(execErrors);

        if (uniqueBuildErrors.length === 0 && uniqueExecErrors.length === 0) return undefined;

        try {
            // Simplify workflow plans
            const simplifiedPlans = workflowPlans?.map(planData => ({
                attemptNumber: planData.attemptNumber,
                outcome: planData.buildSuccess && planData.executionSuccess ? 'SUCCESS' :
                    planData.buildSuccess ? 'EXEC_FAILED' : 'BUILD_FAILED',
                steps: this.simplifyWorkflowPlan(planData.plan).steps.length
            })) || [];

            const prompt = `Analyze these workflow execution failures (batch of ${buildAttempts.length} attempts):

WORKFLOW: "${input.workflowName}"
INSTRUCTION: "${this.truncateString(input.originalInstruction, 150)}"
INTEGRATIONS: [${input.integrationIds.join(', ')}]

ATTEMPT SUMMARY:
${simplifiedPlans.map(p => `- Attempt ${p.attemptNumber}: ${p.outcome} (${p.steps} steps)`).join('\n')}

UNIQUE BUILD ERRORS (${uniqueBuildErrors.length}):
${uniqueBuildErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None'}

UNIQUE EXECUTION ERRORS (${uniqueExecErrors.length}):
${uniqueExecErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None'}

Provide a concise 2-3 sentence diagnosis of the pattern across all attempts. Focus on:
- Common failure points across attempts
- Whether it's a planning vs execution issue
- The most likely fix needed`;

            const { LanguageModel } = await import('../llm/llm.js');
            const response = await LanguageModel.generateText([
                { role: 'user', content: prompt }
            ], 0.3);

            return response.response;
        } catch (error) {
            logMessage('warn', `Failed to generate batch error summary for workflow ${input.workflowId}: ${error}`);
            return `Analysis unavailable. Errors: ${uniqueBuildErrors.length} build, ${uniqueExecErrors.length} execution across ${buildAttempts.length} attempts.`;
        }
    }

    /**
     * Batch analyzes workflow execution report (optimized version)
     */
    async generateBatchWorkflowExecutionReport(input: ErrorAnalysisInput): Promise<WorkflowExecutionReport> {
        const {
            workflowId,
            workflowName,
            buildAttempts,
            executionAttempts,
            workflowPlans = []
        } = input;

        const overallSuccess = buildAttempts.some(b => b.success) && executionAttempts.some(e => e.success);
        const totalAttempts = Math.max(buildAttempts.length, 1);

        // Deduplicate errors
        const buildErrors = buildAttempts.filter(b => !b.success && b.error).map(b => b.error);
        const execErrors = executionAttempts.filter(e => !e.success && e.error).map(e => e.error);

        const uniqueBuildErrors = this.deduplicateErrors(buildErrors);
        const uniqueExecErrors = this.deduplicateErrors(execErrors);

        // Get the last successful plan or the last plan
        const relevantPlan = workflowPlans.find(p => p.buildSuccess && p.executionSuccess) ||
            workflowPlans[workflowPlans.length - 1];

        const simplifiedPlan = relevantPlan ? this.simplifyWorkflowPlan(relevantPlan.plan) : null;

        const prompt = `Analyze this batch of workflow executions:

WORKFLOW: "${workflowName}"
TOTAL ATTEMPTS: ${totalAttempts}
OVERALL SUCCESS: ${overallSuccess}

WORKFLOW STRUCTURE:
${simplifiedPlan ? JSON.stringify(simplifiedPlan, null, 2) : 'No plans generated'}

BUILD ERRORS (${uniqueBuildErrors.length} unique):
${uniqueBuildErrors.slice(0, 3).map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None'}

EXECUTION ERRORS (${uniqueExecErrors.length} unique):  
${uniqueExecErrors.slice(0, 3).map((e, i) => `${i + 1}. ${e}`).join('\n') || 'None'}

Categorize issues into:
1. PLANNING: Workflow structure/step generation problems
2. API: Endpoint/method/request issues
3. INTEGRATION: Auth/credentials problems
4. DATA: Mapping/transformation issues

Provide specific issues and actionable fixes.`;

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
            // Return fallback report
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
                recommendations: ['Manual review needed'],
                executionSummary: `Batch analysis of ${totalAttempts} attempts. ${overallSuccess ? 'Eventually succeeded' : 'All attempts failed'}.`
            };
        }
    }
} 
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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
    primaryIssues: string[];
    authenticationIssues: string[];
    errorPatterns: string[];
    recommendations: string[];
    executionSummary: string;
}

// Zod schema for structured LLM output
const WorkflowExecutionReportSchema = z.object({
    primaryIssues: z.array(z.string()).describe("The most important issues identified, ordered by significance"),
    authenticationIssues: z.array(z.string()).describe("Specific authentication or credential issues (401/403 errors)"),
    errorPatterns: z.array(z.string()).describe("Patterns observed across multiple attempts (e.g., 'Same 401 error on 7/8 attempts')"),
    recommendations: z.array(z.string()).describe("Specific actionable recommendations to fix the issues, ordered by priority"),
    executionSummary: z.string().describe("A concise summary of what happened, the root cause, and whether it eventually succeeded")
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
    logs?: any[];
}

export class WorkflowReportGenerator {

    private truncateString(str: string, maxLength: number = 400): string {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

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
     * Comprehensive workflow analysis that combines error summary and execution report
     */
    async analyzeWorkflowExecution(input: ErrorAnalysisInput): Promise<{
        summary: string;
        report: WorkflowExecutionReport;
    }> {
        const {
            workflowId,
            workflowName,
            buildAttempts,
            executionAttempts,
            workflowPlans = [],
            originalInstruction,
            integrationIds,
            logs = []
        } = input;

        const overallSuccess = buildAttempts.some(b => b.success) && executionAttempts.some(e => e.success);
        const totalAttempts = Math.max(buildAttempts.length, 1);
        const logMessages = logs.map(l => `[${l.level}] ${l.message}`);

        const relevantPlan = workflowPlans.find(p => p.buildSuccess && p.executionSuccess) ||
            workflowPlans[workflowPlans.length - 1];

        const simplifiedPlan = relevantPlan ? this.simplifyWorkflowPlan(relevantPlan.plan) : null;

        // Simplify workflow plans for summary
        const simplifiedPlans = workflowPlans?.map(planData => ({
            attemptNumber: planData.attemptNumber,
            outcome: planData.buildSuccess && planData.executionSuccess ? 'SUCCESS' :
                planData.buildSuccess ? 'EXEC_FAILED' : 'BUILD_FAILED',
            steps: this.simplifyWorkflowPlan(planData.plan).steps.length
        })) || [];

        const prompt = `Analyze the following workflow execution logs and failures across ${totalAttempts} attempts:

WORKFLOW: "${workflowName}"
INSTRUCTION: "${originalInstruction}"
INTEGRATIONS: [${integrationIds.join(', ')}]

ATTEMPT OUTCOMES:
${simplifiedPlans.map(p => `- Attempt ${p.attemptNumber}: ${p.outcome} (${p.steps} steps)`).join('\n')}

WORKFLOW STRUCTURE:
${simplifiedPlan ? JSON.stringify(simplifiedPlan, null, 2) : 'No plans generated'}

ALL RELEVANT LOGS (${logMessages.length} total):
${logMessages.map((msg, i) => `${i + 1}. ${msg}`).join('\n\n') || 'None'}

ANALYSIS INSTRUCTIONS:
- Focus on the log messages (especially WARN/ERROR) to identify error patterns, root causes, and authentication issues.
- Look for repeated errors, HTTP status codes (401, 403, 429, 404), and any signs of misconfiguration or instability.
- Identify the PRIMARY issues preventing success (most significant first).
- Provide specific, actionable recommendations ordered by priority.
- Provide both a concise summary AND detailed analysis.`;

        try {
            const { LanguageModel } = await import('../llm/llm.js');

            // Get structured analysis
            const analysisResponse = await LanguageModel.generateObject([
                { role: 'user', content: prompt }
            ], zodToJsonSchema(WorkflowExecutionReportSchema), 0.2);

            // Get concise summary
            const summaryResponse = await LanguageModel.generateText([
                { role: 'user', content: prompt + '\n\nProvide a concise 2-3 sentence summary focusing on the root cause and most direct fix.' }
            ], 0.3);

            return {
                summary: summaryResponse.response,
                report: {
                    workflowId,
                    workflowName,
                    overallSuccess,
                    totalAttempts,
                    primaryIssues: analysisResponse.response.primaryIssues,
                    authenticationIssues: analysisResponse.response.authenticationIssues,
                    errorPatterns: analysisResponse.response.errorPatterns,
                    recommendations: analysisResponse.response.recommendations,
                    executionSummary: analysisResponse.response.executionSummary
                }
            };
        } catch (error) {

            return {
                summary: `Analysis unavailable. Logs: ${logMessages.length} relevant entries.`,
                report: {
                    workflowId,
                    workflowName,
                    overallSuccess,
                    totalAttempts,
                    primaryIssues: [],
                    authenticationIssues: [],
                    errorPatterns: [],
                    recommendations: ['Manual review needed'],
                    executionSummary: `Batch analysis of ${totalAttempts} attempts. ${overallSuccess ? 'Eventually succeeded' : 'All attempts failed'}.`
                }
            };
        }
    }

    /**
     * @deprecated Use analyzeWorkflowExecution instead
     */
    async generateBatchErrorSummary(input: ErrorAnalysisInput): Promise<string | undefined> {
        const result = await this.analyzeWorkflowExecution(input);
        return result.summary;
    }

    /**
     * @deprecated Use analyzeWorkflowExecution instead
     */
    async generateBatchWorkflowExecutionReport(input: ErrorAnalysisInput): Promise<WorkflowExecutionReport> {
        const result = await this.analyzeWorkflowExecution(input);
        return result.report;
    }
}

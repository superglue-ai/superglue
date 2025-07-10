import { Integration } from '@superglue/client';
import OpenAI from 'openai';
import { AnthropicModel } from '../../llm/anthropic-model.js';
import { OpenAIModel } from '../../llm/openai-model.js';
import { evaluateResponse } from '../../utils/api.js';
import { logMessage } from '../../utils/logs.js';
import { BaseWorkflowConfig } from '../utils/config-loader.js';

export interface DirectLLMResult {
    provider: 'chatgpt' | 'claude';
    workflowId: string;
    workflowName: string;
    successRate: number;
    totalAttempts: number;
    successfulAttempts: number;
    attempts: DirectLLMAttempt[];
}

export interface DirectLLMAttempt {
    attemptNumber: number;
    success: boolean;
    generatedCode?: string;
    executionResult?: any;
    error?: string;
    executionTime: number;
}

export class DirectLLMEvaluator {
    private openaiModel: OpenAIModel;
    private anthropicModel: AnthropicModel;
    private metadata: { orgId: string; userId: string };

    constructor(orgId: string = 'competitor-eval', userId: string = 'system') {
        this.openaiModel = new OpenAIModel();
        this.anthropicModel = new AnthropicModel();
        this.metadata = { orgId, userId };
    }

    /**
     * Evaluate a workflow with ChatGPT and Claude
     */
    async evaluateWorkflow(
        workflow: BaseWorkflowConfig,
        integrations: Integration[],
        maxAttempts: number
    ): Promise<{ chatgpt: DirectLLMResult; claude: DirectLLMResult }> {
        logMessage('info', `🤖 Evaluating workflow ${workflow.name} with ChatGPT and Claude`, this.metadata);

        const [chatgptResult, claudeResult] = await Promise.all([
            this.evaluateWithProvider('chatgpt', workflow, integrations, maxAttempts),
            this.evaluateWithProvider('claude', workflow, integrations, maxAttempts)
        ]);

        return { chatgpt: chatgptResult, claude: claudeResult };
    }

    /**
     * Evaluate with a specific LLM provider
     */
    private async evaluateWithProvider(
        provider: 'chatgpt' | 'claude',
        workflow: BaseWorkflowConfig,
        integrations: Integration[],
        maxAttempts: number
    ): Promise<DirectLLMResult> {
        const attempts: DirectLLMAttempt[] = [];
        let successfulAttempts = 0;

        for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
            logMessage('info',
                `📝 ${provider} attempt ${attemptNum}/${maxAttempts} for ${workflow.name}`,
                this.metadata
            );

            const attempt = await this.runSingleAttempt(provider, workflow, integrations, attemptNum);
            attempts.push(attempt);

            if (attempt.success) {
                successfulAttempts++;
                logMessage('info', `✅ ${provider} succeeded on attempt ${attemptNum}`, this.metadata);
            } else {
                logMessage('warn',
                    `❌ ${provider} failed on attempt ${attemptNum}: ${attempt.error}`,
                    this.metadata
                );
            }

            // Add delay between attempts
            if (attemptNum < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const successRate = successfulAttempts / maxAttempts;

        return {
            provider,
            workflowId: workflow.id,
            workflowName: workflow.name,
            successRate,
            totalAttempts: maxAttempts,
            successfulAttempts,
            attempts
        };
    }

    /**
     * Run a single attempt with an LLM provider
     */
    private async runSingleAttempt(
        provider: 'chatgpt' | 'claude',
        workflow: BaseWorkflowConfig,
        integrations: Integration[],
        attemptNumber: number
    ): Promise<DirectLLMAttempt> {
        const startTime = Date.now();
        const attempt: DirectLLMAttempt = {
            attemptNumber,
            success: false,
            executionTime: 0
        };

        try {
            // Generate the prompt
            const prompt = this.generatePrompt(workflow, integrations);

            // Get code from LLM
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                { role: 'system', content: this.getSystemPrompt() },
                { role: 'user', content: prompt }
            ];

            const llmResponse = provider === 'chatgpt'
                ? await this.openaiModel.generateText(messages, 0.1)
                : await this.anthropicModel.generateText(messages, 0.1);

            // Extract code from response
            const code = this.extractCode(llmResponse.response);
            attempt.generatedCode = code;

            if (!code) {
                throw new Error('No valid JavaScript code found in response');
            }

            // Execute the code safely
            const result = await this.executeCode(code, workflow.payload || {});
            attempt.executionResult = result;

            // Evaluate if the result matches the instruction
            const evaluation = await this.evaluateResult(result, workflow.instruction, integrations);

            if (!evaluation.success) {
                throw new Error(evaluation.reason);
            }

            attempt.success = true;

        } catch (error) {
            attempt.error = error instanceof Error ? error.message : String(error);
            attempt.success = false;
        }

        attempt.executionTime = Date.now() - startTime;
        return attempt;
    }

    /**
     * Generate the prompt for the LLM
     */
    private generatePrompt(workflow: BaseWorkflowConfig, integrations: Integration[]): string {
        const integrationDetails = integrations.map(integration => {
            const credentials = Object.entries(integration.credentials || {})
                .map(([key, value]) => `${key}: "${value}"`)
                .join(', ');

            const configExample = `{
    id: "${integration.id}",
    name: "${integration.name}",
    urlHost: "${integration.urlHost}",
    documentationUrl: "${integration.documentationUrl || 'Not provided'}",
    credentials: { ${credentials} }
}`;

            return `Integration: ${integration.name}
Configuration: ${configExample}
Documentation Summary: ${integration.documentation ? integration.documentation.slice(0, 2000) + '...' : 'No documentation available'}`;
        }).join('\n\n');

        return `Task: ${workflow.instruction}

Available Integrations:
${integrationDetails}

Input Payload:
${JSON.stringify(workflow.payload || {}, null, 2)}

Please write JavaScript code that:
1. Makes the necessary API calls to fulfill the task
2. Processes the responses as needed
3. Returns the final result in the format requested by the instruction
4. Uses only vanilla JavaScript with fetch() for HTTP requests
5. Wraps all code in <<CODE>> tags

Important:
- The code will be executed in a sandboxed environment with access to fetch()
- Return the final result, don't console.log it
- Handle errors appropriately
- The payload is available as a global 'payload' variable`;
    }

    /**
     * Get the system prompt for code generation
     */
    private getSystemPrompt(): string {
        return `You are an expert JavaScript developer tasked with writing code to integrate with APIs.
Generate clean, working JavaScript code that fulfills the given task using the provided API integrations.
The code should be self-contained and return the requested data.
Always wrap your code in <<CODE>> tags.`;
    }

    /**
     * Extract code from LLM response
     */
    private extractCode(response: string): string | null {
        // Try to extract code between <<CODE>> tags first
        const codeMatch = response.match(/<<CODE>>([\s\S]*?)<<\/CODE>>/);
        if (codeMatch) {
            return codeMatch[1].trim();
        }

        // Try to extract code between ```javascript blocks
        const jsMatch = response.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
        if (jsMatch) {
            return jsMatch[1].trim();
        }

        // Last resort: if the entire response looks like code
        if (response.includes('fetch(') || response.includes('async function')) {
            return response.trim();
        }

        return null;
    }

    /**
     * Execute the generated code safely
     */
    private async executeCode(code: string, payload: any): Promise<any> {
        // Create a function that returns the result
        const wrappedCode = `
            (async function() {
                const payload = ${JSON.stringify(payload)};
                ${code}
            })()
        `;

        try {
            // Use eval in a try-catch (in production, use a proper sandbox like VM2 or isolated-vm)
            const result = await eval(wrappedCode);
            return result;
        } catch (error) {
            throw new Error(`Code execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Evaluate if the result matches the instruction
     */
    private async evaluateResult(
        result: any,
        instruction: string,
        integrations: Integration[]
    ): Promise<{ success: boolean; reason?: string }> {
        try {
            // Use the existing evaluateResponse function
            const documentation = integrations[0]?.documentation || '';
            const evaluation = await evaluateResponse(result, undefined, instruction, documentation);

            return {
                success: evaluation.success,
                reason: evaluation.shortReason
            };
        } catch (error) {
            return {
                success: false,
                reason: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Validate that required API keys are present
     */
    static validateApiKeys(): { isValid: boolean; missing: string[] } {
        const missing: string[] = [];

        if (!process.env.OPENAI_API_KEY) {
            missing.push('OPENAI_API_KEY');
        }

        if (!process.env.ANTHROPIC_API_KEY) {
            missing.push('ANTHROPIC_API_KEY');
        }

        return {
            isValid: missing.length === 0,
            missing
        };
    }
} 
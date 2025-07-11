import { Integration } from '@superglue/client';
import OpenAI from 'openai';
import { logMessage } from '../../utils/logs.js';
import { BaseWorkflowConfig } from '../utils/config-loader.js';

// Types are safe to import
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
    private openaiModel: any = null;
    private anthropicModel: any = null;
    private metadata: { orgId: string; userId: string };

    constructor(orgId: string = 'competitor-eval', userId: string = 'system') {
        this.metadata = { orgId, userId };
    }

    private async getOpenAIModel() {
        if (!this.openaiModel) {
            const { OpenAIModel } = await import('../../llm/openai-model.js');
            this.openaiModel = new OpenAIModel();
        }
        return this.openaiModel;
    }

    private async getAnthropicModel() {
        if (!this.anthropicModel) {
            const { AnthropicModel } = await import('../../llm/anthropic-model.js');
            this.anthropicModel = new AnthropicModel();
        }
        return this.anthropicModel;
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

            const model = provider === 'chatgpt'
                ? await this.getOpenAIModel()
                : await this.getAnthropicModel();

            const llmResponse = await model.generateText(messages, 0.1);

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
            // Build credentials object with actual values
            const credentialEntries = Object.entries(integration.credentials || {});
            const credentialPairs = credentialEntries.map(([key, value]) => {
                // Make sure we have actual values
                if (!value || value === '') {
                    logMessage('warn',
                        `Missing credential ${key} for integration ${integration.id}`,
                        this.metadata
                    );
                    return `    const ${key} = "MISSING_CREDENTIAL";`;
                }
                // Show the actual value in the prompt
                return `    const ${key} = "${value}";`;
            });

            // Create a ready-to-use code snippet for this integration
            const codeSnippet = `// ${integration.name} Configuration
const ${integration.id}_config = {
    baseUrl: "${integration.urlHost}"
};
${credentialPairs.join('\n')};`;

            return `Integration: ${integration.name}
Base URL: ${integration.urlHost}

Ready-to-use configuration:
${codeSnippet}

Documentation Summary: ${integration.documentation ? integration.documentation.slice(0, 1500) + '...' : 'No documentation available'}`;
        }).join('\n\n---\n\n');

        return `Task: ${workflow.instruction}

Available Integrations:
${integrationDetails}

Input Payload (already defined as 'payload'):
const payload = ${JSON.stringify(workflow.payload || {}, null, 2)};

INSTRUCTIONS:
Write JavaScript code that fulfills the task above. The code should:
1. Use the EXACT configuration values shown above (copy them directly)
2. Make API calls using fetch()
3. Process the responses as needed
4. Return the final result matching the requested format
5. Wrap all code between <<CODE>> and <</CODE>> tags (note the / in the closing tag)

CRITICAL - Use the EXACT values shown above. For example:
- If you see: const secret_key = "sk_test_123"; then use EXACTLY "sk_test_123"
- DO NOT write <<secret_key>> or \${secret_key} or any template syntax
- Copy the credential values EXACTLY as shown

Example structure:
<<CODE>>
async function executeTask() {
    // Copy the configuration exactly as shown above
    const stripe_config = {
        baseUrl: "https://api.stripe.com"
    };
    const secret_key = "sk_test_123"; // Define credentials OUTSIDE the config object
    
    const response = await fetch(stripe_config.baseUrl + '/v1/subscriptions', {
        headers: {
            'Authorization': 'Bearer ' + secret_key,
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    // Process data and return result
    return { result: data };
}
return executeTask();
<</CODE>>`;
    }

    /**
     * Get the system prompt for code generation
     */
    private getSystemPrompt(): string {
        return `You are an expert JavaScript developer tasked with writing code to integrate with APIs.
Generate clean, working JavaScript code that fulfills the given task using the provided API integrations.
The code should be self-contained and return the requested data.
Always wrap your code in <<CODE>> and <</CODE>> tags (note the closing tag has a forward slash).`;
    }

    /**
     * Extract code from LLM response
     */
    private extractCode(response: string): string | null {
        // Remove surrounding backticks if present
        let cleanResponse = response.trim();
        if (cleanResponse.startsWith('`') && cleanResponse.endsWith('`')) {
            cleanResponse = cleanResponse.slice(1, -1).trim();
        }

        // Try to extract code between <<CODE>> tags (with or without closing slash)
        // First try with proper closing tag
        let codeMatch = cleanResponse.match(/<<CODE>>([\s\S]*?)<<\/CODE>>/);
        if (codeMatch) {
            return codeMatch[1].trim();
        }

        // Then try with <<CODE>> as both opening and closing
        codeMatch = cleanResponse.match(/<<CODE>>([\s\S]*?)<<CODE>>/);
        if (codeMatch) {
            return codeMatch[1].trim();
        }

        // Try to extract code between ```javascript blocks
        const jsMatch = cleanResponse.match(/```(?:javascript|js)?\n?([\s\S]*?)```/);
        if (jsMatch) {
            return jsMatch[1].trim();
        }

        // Last resort: if the entire response looks like code
        if (cleanResponse.includes('fetch(') || cleanResponse.includes('async function')) {
            // Check if it still has <<CODE>> tags at the beginning/end and remove them
            cleanResponse = cleanResponse.replace(/^<<CODE>>/, '').replace(/<<CODE>>$/, '').trim();
            return cleanResponse;
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
            // Load evaluateResponse dynamically
            const { evaluateResponse } = await import('../../utils/api.js');
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
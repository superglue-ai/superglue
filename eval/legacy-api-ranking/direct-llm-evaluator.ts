// import { Integration } from '@superglue/client';
// import OpenAI from 'openai';
// import { logMessage } from '../../utils/logs.js';
// import { BaseWorkflowConfig } from '../utils/config-loader.js';
// import type { LLMMessage } from '../../llm/llm.js';

// export interface DirectLLMResult {
//     provider: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514' | 'gpt-4.1' | 'o4-mini' | 'gemini-2.5-flash';
//     workflowId: string;
//     workflowName: string;
//     successRate: number;
//     totalAttempts: number;
//     successfulAttempts: number;
//     attempts: DirectLLMAttempt[];
// }

// export interface DirectLLMAttempt {
//     attemptNumber: number;
//     success: boolean;
//     generatedCode?: string;
//     executionResult?: any;
//     error?: string;
//     executionTime: number;
// }

// export class DirectLLMEvaluator {
//     private metadata: { orgId: string; userId: string };

//     constructor(orgId: string = 'competitor-eval', userId: string = 'system') {
//         this.metadata = { orgId, userId };
//     }

//     private async getOpenAIModel(modelName?: string) {
//         const { OpenAIModel } = await import('../../llm/openai-model.js');
//         return new OpenAIModel(modelName);
//     }

//     private async getAnthropicModel(modelName?: string) {
//         const { AnthropicModel } = await import('../../llm/anthropic-model.js');
//         return new AnthropicModel(modelName);
//     }

//     private async getGeminiModel(modelName?: string) {
//         const { GeminiModel } = await import('../../llm/gemini-model.js');
//         return new GeminiModel(modelName);
//     }

//     /**
//      * Evaluate a workflow with multiple LLM models
//      */
//     async evaluateWorkflow(
//         workflow: BaseWorkflowConfig,
//         integrations: Integration[],
//         maxAttempts: number
//     ): Promise<Record<DirectLLMResult['provider'], DirectLLMResult>> {
//         logMessage('info', `🤖 Evaluating workflow ${workflow.name} with multiple LLM models`, this.metadata);

//         const providers: DirectLLMResult['provider'][] = [
//             'claude-sonnet-4-20250514',
//             'claude-opus-4-20250514',
//             'gpt-4.1',
//             'o4-mini',
//             'gemini-2.5-flash'
//         ];

//         const results = await Promise.all(
//             providers.map(provider => 
//                 this.evaluateWithProvider(provider, workflow, integrations, maxAttempts)
//             )
//         );

//         return providers.reduce((acc, provider, index) => {
//             acc[provider] = results[index];
//             return acc;
//         }, {} as Record<DirectLLMResult['provider'], DirectLLMResult>);
//     }

//     /**
//      * Evaluate with a specific LLM provider
//      */
//     private async evaluateWithProvider(
//         provider: DirectLLMResult['provider'],
//         workflow: BaseWorkflowConfig,
//         integrations: Integration[],
//         maxAttempts: number
//     ): Promise<DirectLLMResult> {
//         const attempts: DirectLLMAttempt[] = [];
//         let successfulAttempts = 0;

//         for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
//             logMessage('info',
//                 `📝 ${provider} attempt ${attemptNum}/${maxAttempts} for ${workflow.name}`,
//                 this.metadata
//             );

//             const attempt = await this.runSingleAttempt(provider, workflow, integrations, attemptNum);
//             attempts.push(attempt);

//             if (attempt.success) {
//                 successfulAttempts++;
//                 logMessage('info', `✅ ${provider} succeeded on attempt ${attemptNum}`, this.metadata);
//             } else {
//                 logMessage('warn',
//                     `❌ ${provider} failed on attempt ${attemptNum}: ${attempt.error}`,
//                     this.metadata
//                 );
//             }

//             // Force garbage collection between attempts (if running with --expose-gc)
//             if (global.gc) {
//                 global.gc();
//             }

//             // Add small delay to prevent overwhelming the system
//             await new Promise(resolve => setTimeout(resolve, 100));
//         }

//         const successRate = successfulAttempts / maxAttempts;

//         return {
//             provider,
//             workflowId: workflow.id,
//             workflowName: workflow.name,
//             successRate,
//             totalAttempts: maxAttempts,
//             successfulAttempts,
//             attempts
//         };
//     }

//     /**
//      * Run a single attempt with an LLM provider
//      */
//     private async runSingleAttempt(
//         provider: DirectLLMResult['provider'],
//         workflow: BaseWorkflowConfig,
//         integrations: Integration[],
//         attemptNumber: number
//     ): Promise<DirectLLMAttempt> {
//         const startTime = Date.now();
//         const attempt: DirectLLMAttempt = {
//             attemptNumber,
//             success: false,
//             executionTime: 0
//         };

//         try {
//             // Generate the prompt
//             const prompt = this.generatePrompt(workflow, integrations);

//             // Get code from LLM
//             const messages: LLMMessage[] = [
//                 { role: 'system', content: this.getSystemPrompt() },
//                 { role: 'user', content: prompt }
//             ];

//             let model;
            
//             switch (provider) {
//                 case 'claude-sonnet-4-20250514':
//                     model = await this.getAnthropicModel('claude-sonnet-4-20250514');
//                     break;
//                 case 'claude-opus-4-20250514':
//                     model = await this.getAnthropicModel('claude-opus-4-20250514');
//                     break;
//                 case 'gpt-4.1':
//                     model = await this.getOpenAIModel('gpt-4.1');
//                     break;
//                 case 'o4-mini':
//                     model = await this.getOpenAIModel('o4-mini');
//                     break;
//                 case 'gemini-2.5-flash':
//                     model = await this.getGeminiModel('gemini-2.5-flash');
//                     break;
//             }

//             const llmResponse = await model.generateText(messages, 0.1);

//             // Extract code from response
//             const code = this.extractCode(llmResponse.response);
//             attempt.generatedCode = code;

//             if (!code) {
//                 throw new Error('No valid JavaScript code found in response');
//             }

//             // Execute the code safely
//             const result = await this.executeCode(code, workflow.payload || {});
//             attempt.executionResult = result;

//             // Evaluate if the result matches the instruction
//             const evaluation = await this.evaluateResult(result, workflow.instruction, integrations);

//             if (!evaluation.success) {
//                 throw new Error(evaluation.reason);
//             }

//             attempt.success = true;

//         } catch (error) {
//             attempt.error = error instanceof Error ? error.message : String(error);
//             attempt.success = false;
//         }

//         attempt.executionTime = Date.now() - startTime;

//         // Truncate large results/code to save memory
//         if (attempt.generatedCode && attempt.generatedCode.length > 10000) {
//             attempt.generatedCode = attempt.generatedCode.substring(0, 10000) + '... [truncated]';
//         }
//         if (attempt.executionResult && JSON.stringify(attempt.executionResult).length > 10000) {
//             attempt.executionResult = { truncated: true, preview: JSON.stringify(attempt.executionResult).substring(0, 1000) };
//         }

//         return attempt;
//     }

//     /**
//      * Generate the prompt for the LLM
//      */
//     private generatePrompt(workflow: BaseWorkflowConfig, integrations: Integration[]): string {
//         const integrationDetails = integrations.map(integration => {
//             // Build credentials object with actual values
//             const credentialEntries = Object.entries(integration.credentials || {});
//             const credentialPairs = credentialEntries.map(([key, value]) => {
//                 // Make sure we have actual values
//                 if (!value || value === '') {
//                     logMessage('warn',
//                         `Missing credential ${key} for integration ${integration.id}`,
//                         this.metadata
//                     );
//                     return `    const ${key} = "MISSING_CREDENTIAL";`;
//                 }
//                 // Show the actual value in the prompt
//                 return `    const ${key} = "${value}";`;
//             });

//             // Create a ready-to-use code snippet for this integration
//             const codeSnippet = `// ${integration.name} Configuration
// const ${integration.id}_config = {
//     baseUrl: "${integration.urlHost}"
// };
// ${credentialPairs.join('\n')};`;

//             return `Integration: ${integration.name}
// Base URL: ${integration.urlHost}

// Ready-to-use configuration:
// ${codeSnippet}

// Documentation Summary: ${integration.documentation ? integration.documentation.slice(0, 1500) + '...' : 'No documentation available'}`;
//         }).join('\n\n---\n\n');

//         return `Task: ${workflow.instruction}

// Available Integrations:
// ${integrationDetails}

// Input Payload (already defined as 'payload'):
// const payload = ${JSON.stringify(workflow.payload || {}, null, 2)};

// INSTRUCTIONS:
// Write JavaScript code that fulfills the task above. The code should:
// 1. Use the EXACT configuration values shown above (copy them directly)
// 2. Make API calls using fetch()
// 3. Process the responses as needed
// 4. Return the final result matching the requested format
// 5. Wrap all code between <<CODE>> and <</CODE>> tags (note the / in the closing tag)

// CRITICAL - Use the EXACT values shown above. For example:
// - If you see: const secret_key = "sk_test_123"; then use EXACTLY "sk_test_123"
// - DO NOT write <<secret_key>> or \${secret_key} or any template syntax
// - Copy the credential values EXACTLY as shown

// Example structure:
// <<CODE>>
// async function executeTask() {
//     // Copy the configuration exactly as shown above
//     const stripe_config = {
//         baseUrl: "https://api.stripe.com"
//     };
//     const secret_key = "sk_test_123"; // Define credentials OUTSIDE the config object
    
//     const response = await fetch(stripe_config.baseUrl + '/v1/subscriptions', {
//         headers: {
//             'Authorization': 'Bearer ' + secret_key,
//             'Content-Type': 'application/json'
//         }
//     });
    
//     const data = await response.json();
//     // Process data and return result
//     return { result: data };
// }
// return executeTask();
// <</CODE>>`;
//     }

//     /**
//      * Get the system prompt for code generation
//      */
//     private getSystemPrompt(): string {
//         return `You are an expert JavaScript developer tasked with writing code to integrate with APIs.
// Generate clean, working JavaScript code that fulfills the given task using the provided API integrations.
// The code should be self-contained and return the requested data.
// Always wrap your code in <<CODE>> and <</CODE>> tags (note the closing tag has a forward slash).`;
//     }

//     /**
//      * Extract code from LLM response
//      */
//     private extractCode(response: string): string | null {
//         // Remove surrounding backticks if present
//         let cleanResponse = response.trim();
//         if (cleanResponse.startsWith('`') && cleanResponse.endsWith('`')) {
//             cleanResponse = cleanResponse.slice(1, -1).trim();
//         }

//         // Try to extract code between <<CODE>> tags (with or without closing slash)
//         // First try with proper closing tag
//         let codeMatch = cleanResponse.match(/<<CODE>>([\s\S]*?)<<\/CODE>>/);
//         if (codeMatch) {
//             return codeMatch[1].trim();
//         }

//         // Then try with <<CODE>> as both opening and closing
//         codeMatch = cleanResponse.match(/<<CODE>>([\s\S]*?)<<CODE>>/);
//         if (codeMatch) {
//             return codeMatch[1].trim();
//         }

//         // Try to extract code between ```javascript blocks
//         const jsMatch = cleanResponse.match(/```(?:javascript|js)?\n?([\s\S]*?)```/);
//         if (jsMatch) {
//             return jsMatch[1].trim();
//         }

//         // Last resort: if the entire response looks like code
//         if (cleanResponse.includes('fetch(') || cleanResponse.includes('async function')) {
//             // Check if it still has <<CODE>> tags at the beginning/end and remove them
//             cleanResponse = cleanResponse.replace(/^<<CODE>>/, '').replace(/<<CODE>>$/, '').trim();
//             return cleanResponse;
//         }

//         return null;
//     }

//     /**
//      * Execute the generated code safely
//      */
//     private async executeCode(code: string, payload: any): Promise<any> {
//         // Create a function that returns the result
//         const wrappedCode = `
//             (async function() {
//                 const payload = ${JSON.stringify(payload)};
//                 ${code}
//             })()
//         `;

//         try {
//             // Create a timeout promise that rejects after 20 seconds
//             const TIMEOUT_MS = 20000;
//             const timeoutPromise = new Promise((_, reject) => {
//                 setTimeout(() => reject(new Error('Code execution timed out after 20 seconds')), TIMEOUT_MS);
//             });

//             // Race the code execution against the timeout
//             const result = await Promise.race([
//                 eval(wrappedCode),
//                 timeoutPromise
//             ]);
            
//             return result;
//         } catch (error) {
//             throw new Error(`Code execution failed: ${error instanceof Error ? error.message : String(error)}`);
//         }
//     }

    // /**
    //  * Evaluate if the result matches the instruction
    //  */
    // private async evaluateResult(
    //     result: any,
    //     instruction: string,
    //     integrations: Integration[]
    // ): Promise<{ success: boolean; reason?: string }> {
    //     try {
    //         // Load evaluateResponse dynamically
    //         const { evaluateStepResponse } = await import('../../execute/workflow-step.js');
    //         const documentation = integrations[0]?.documentation || '';
    //         const evaluation = await evaluateStepResponse({
    //             data: result,
    //             endpoint: {instruction} as any,
    //             documentation
    //         });

//             return {
//                 success: evaluation.success,
//                 reason: evaluation.shortReason
//             };
//         } catch (error) {
//             return {
//                 success: false,
//                 reason: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`
//             };
//         }
//     }

//     /**
//      * Validate that required API keys are present
//      */
//     static validateApiKeys(): { isValid: boolean; missing: string[] } {
//         const missing: string[] = [];

//         if (!process.env.OPENAI_API_KEY) {
//             missing.push('OPENAI_API_KEY');
//         }

//         if (!process.env.ANTHROPIC_API_KEY) {
//             missing.push('ANTHROPIC_API_KEY');
//         }

//         if (!process.env.GEMINI_API_KEY) {
//             missing.push('GEMINI_API_KEY');
//         }

//         return {
//             isValid: missing.length === 0,
//             missing
//         };
//     }
// } 
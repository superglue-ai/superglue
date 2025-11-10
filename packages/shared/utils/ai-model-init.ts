import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * Initializes the AI model provider.
 * 
 * Two modes:
 * 1. Vercel AI Gateway: If AI_GATEWAY_API_KEY is set, routes through a unified gateway that handles 
 *    provider abstraction. Just returns the provider model string (e.g. "anthropic/claude-sonnet-4-5").
 *    The gateway handles auth and routing to the actual provider. 
 * 
 * 2. Direct AI SDK Providers: Falls back to initializing specific providers (Anthropic, OpenAI, 
 *    Gemini, Azure) using Vercel AI SDK. Requires provider-specific API keys and configs.
 *    Uses provider-specific model env vars (e.g., OPENAI_MODEL, ANTHROPIC_MODEL, GEMINI_MODEL).
 * 
 * @param options - Configuration options
 * @param options.providerEnvVar - Environment variable name for the provider (default: 'LLM_PROVIDER')
 * @param options.defaultModel - Default model if not specified in env (default: 'gpt-4.1')
 * @returns AI model instance that can be used with Vercel AI SDK functions
 */
export function initializeAIModel(options?: {
    providerEnvVar?: string;
    defaultModel?: string;
}): any {
    const providerEnvVar = options?.providerEnvVar || 'LLM_PROVIDER';
    const defaultModel = options?.defaultModel || 'gpt-4.1';

    if (process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_MODEL) {
        return process.env.AI_GATEWAY_MODEL;
    }

    let provider: any;
    let modelId: string;
    const providerType = process.env[providerEnvVar]?.toLowerCase();

    switch (providerType) {
        case 'anthropic': {
            const anthropicOptions: any = { apiKey: process.env.ANTHROPIC_API_KEY, headers: {'anthropic-beta': 'context-1m-2025-08-07'}};
            if (process.env.ANTHROPIC_BASE_URL) {
                anthropicOptions.baseURL = process.env.ANTHROPIC_BASE_URL;
            }
            provider = createAnthropic(anthropicOptions);
            modelId = process.env.ANTHROPIC_MODEL || defaultModel;
            break;
        }
        case 'openai': {
            const openaiOptions: any = { apiKey: process.env.OPENAI_API_KEY };
            if (process.env.OPENAI_BASE_URL) {
                openaiOptions.baseURL = process.env.OPENAI_BASE_URL;
            }
            provider = createOpenAI(openaiOptions);
            modelId = process.env.OPENAI_MODEL || defaultModel;
            break;
        }
        case 'gemini': {
            const geminiOptions: any = { apiKey: process.env.GEMINI_API_KEY };
            if (process.env.GEMINI_BASE_URL) {
                geminiOptions.baseURL = process.env.GEMINI_BASE_URL;
            }
            provider = createGoogleGenerativeAI(geminiOptions);
            modelId = process.env.GEMINI_MODEL || defaultModel;
            break;
        }
        case 'azure': {
            const azureOptions: any = { apiKey: process.env.AZURE_API_KEY };
            if (!process.env.AZURE_RESOURCE_NAME && !process.env.AZURE_BASE_URL) {
                throw new Error('Either AZURE_RESOURCE_NAME or AZURE_BASE_URL needs to be set');
            }
            if (process.env.AZURE_RESOURCE_NAME) {
                azureOptions.resourceName = process.env.AZURE_RESOURCE_NAME;
            }
            if (process.env.AZURE_BASE_URL) {
                azureOptions.baseURL = process.env.AZURE_BASE_URL;
            }
            if (process.env.AZURE_API_VERSION) {
                azureOptions.apiVersion = process.env.AZURE_API_VERSION;
            }
            if (process.env.AZURE_USE_DEPLOYMENT_BASED_URLS) {
                azureOptions.useDeploymentBasedUrls = process.env.AZURE_USE_DEPLOYMENT_BASED_URLS;
            }
            provider = createAzure(azureOptions);
            modelId = process.env.AZURE_MODEL || defaultModel;
            break;
        }
        default:
            throw new Error(`Invalid provider: ${providerType}. Must be one of: anthropic, openai, gemini, azure`);
    }

    return provider(modelId);
}


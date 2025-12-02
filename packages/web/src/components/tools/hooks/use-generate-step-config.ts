import { useState } from 'react';
import { useConfig } from '@/src/app/config-context';
import { ApiConfig, SuperglueClient } from '@superglue/shared';
import { tokenRegistry } from '@/src/lib/token-registry';

interface GenerateStepConfigParams {
    currentStepConfig?: any;
    stepInput?: Record<string, any>;
    integrationId?: string;
    credentials?: Record<string, string>;
    errorMessage?: string;
}

export function useGenerateStepConfig() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = useConfig();

    const generateConfig = async (params: GenerateStepConfigParams) => {
        setIsGenerating(true);
        setError(null);

        try {
            const client = new SuperglueClient({
                endpoint: config.superglueEndpoint,
                apiKey: tokenRegistry.getToken(),
            });

            const result: { config: ApiConfig, dataSelector: string } = await client.generateStepConfig({
                currentStepConfig: params.currentStepConfig,
                stepInput: params.stepInput,
                integrationId: params.integrationId,
                credentials: params.credentials,
                errorMessage: params.errorMessage,
            });

            // The result now has shape: { config: ApiConfig, dataSelector: string }
            return result;
        } catch (err: any) {
            const errorMessage = err?.message || 'Failed to generate step configuration';
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        generateConfig,
        isGenerating,
        error,
    };
}

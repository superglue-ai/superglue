import { useConfig } from '@/src/app/config-context';
import { createSuperglueClient } from '@/src/lib/client-utils';
import { useState } from 'react';

interface GenerateTransformParams {
    currentTransform: string;
    responseSchema?: any;
    stepData: Record<string, any>;
    errorMessage?: string;
    instruction?: string;
}

export function useGenerateTransform() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = useConfig();

    const generateTransform = async (params: GenerateTransformParams) => {
        setIsGenerating(true);
        setError(null);

        try {
            const client = createSuperglueClient(config.superglueEndpoint);
            
            const transformCode = await client.generateTransform({
                currentTransform: params.currentTransform,
                responseSchema: params.responseSchema,
                stepData: params.stepData,
                errorMessage: params.errorMessage,
                instruction: params.instruction,
            });

            return transformCode;
        } catch (err: any) {
            const errorMessage = err?.message || 'Failed to generate transform code';
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        generateTransform,
        isGenerating,
        error,
    };
}
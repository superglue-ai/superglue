import { useConfig } from '@/src/app/config-context';
import { tokenRegistry } from '@/src/lib/token-registry';
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
            const query = `
                mutation GenerateTransform(
                    $currentTransform: String!,
                    $responseSchema: JSONSchema,
                    $stepData: JSON!,
                    $errorMessage: String,
                    $instruction: String
                ) {
                    generateTransform(
                        currentTransform: $currentTransform,
                        responseSchema: $responseSchema,
                        stepData: $stepData,
                        errorMessage: $errorMessage,
                        instruction: $instruction
                    ) {
                        transformCode
                    }
                }
            `;

            const response = await fetch(config.superglueEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tokenRegistry.getToken()}`,
                },
                body: JSON.stringify({
                    query,
                    variables: {
                        currentTransform: params.currentTransform,
                        responseSchema: params.responseSchema,
                        stepData: params.stepData,
                        errorMessage: params.errorMessage,
                        instruction: params.instruction,
                    },
                }),
            });

            const json = await response.json();

            if (json.errors) {
                throw new Error(json.errors[0]?.message || 'Failed to generate transform');
            }

            return json.data.generateTransform.transformCode;
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


import { createContext, useContext, ReactNode, useMemo } from 'react';

export interface CategorizedVariables {
    credentials: string[];
    toolInputs: string[];
    fileInputs: string[];
    currentStepData: string[];
    previousStepData: string[];
    paginationVariables: string[];
}

export interface CategorizedSources {
    manualPayload: Record<string, unknown>;
    filePayloads: Record<string, unknown>;
    previousStepResults: Record<string, unknown>;
    currentItem: Record<string, unknown> | null;
    paginationData: Record<string, unknown>;
}

interface TemplateContextValue {
    stepData: any;
    dataSelectorOutput?: any;
    readOnly: boolean;
    credentialKeys?: Set<string>;
    canExecute?: boolean;
    categorizedVariables: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    stepId?: string;
    sourceDataVersion: number;
}

const emptyCategorizedVariables: CategorizedVariables = {
    credentials: [],
    toolInputs: [],
    fileInputs: [],
    currentStepData: [],
    previousStepData: [],
    paginationVariables: [],
};

const emptyCategorizedSources: CategorizedSources = {
    manualPayload: {},
    filePayloads: {},
    previousStepResults: {},
    currentItem: null,
    paginationData: {},
};

const TemplateContext = createContext<TemplateContextValue>({
    stepData: {},
    dataSelectorOutput: undefined,
    readOnly: false,
    credentialKeys: undefined,
    canExecute: true,
    categorizedVariables: emptyCategorizedVariables,
    categorizedSources: emptyCategorizedSources,
    stepId: undefined,
    sourceDataVersion: 0,
});

export function TemplateContextProvider({
    children,
    stepData,
    dataSelectorOutput,
    readOnly = false,
    canExecute = true,
    categorizedVariables = emptyCategorizedVariables,
    categorizedSources = emptyCategorizedSources,
    stepId,
    sourceDataVersion = 0,
}: {
    children: ReactNode;
    stepData: any;
    dataSelectorOutput?: any;
    readOnly?: boolean;
    canExecute?: boolean;
    categorizedVariables?: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    stepId?: string;
    sourceDataVersion?: number;
}) {
    const credentialKeys = useMemo(() => {
        if (!stepData || typeof stepData !== 'object') return undefined;
        return new Set(
            Object.keys(stepData).filter(key => {
                const value = stepData[key];
                if (typeof value === 'string' && value.length > 0) {
                    const pattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*_[a-zA-Z0-9_$]+$/;
                    return pattern.test(key);
                }
                return false;
            })
        );
    }, [stepData]);

    const value = useMemo(() => ({
        stepData, dataSelectorOutput, readOnly, credentialKeys, canExecute, categorizedVariables, categorizedSources, stepId, sourceDataVersion
    }), [stepData, dataSelectorOutput, readOnly, credentialKeys, canExecute, categorizedVariables, categorizedSources, stepId, sourceDataVersion]);

    return (
        <TemplateContext.Provider value={value}>
            {children}
        </TemplateContext.Provider>
    );
}

export function useTemplateContext() {
    return useContext(TemplateContext);
}


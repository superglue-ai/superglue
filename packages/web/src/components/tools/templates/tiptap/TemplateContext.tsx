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
    loopData?: any;
    readOnly: boolean;
    credentialKeys?: Set<string>;
    canExecute?: boolean;
    categorizedVariables: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    sourceDataVersion?: number;
    stepId?: string;
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
    loopData: undefined,
    readOnly: false,
    credentialKeys: undefined,
    canExecute: true,
    categorizedVariables: emptyCategorizedVariables,
    categorizedSources: emptyCategorizedSources,
    sourceDataVersion: undefined,
    stepId: undefined,
});

export function TemplateContextProvider({
    children,
    stepData,
    loopData,
    readOnly = false,
    canExecute = true,
    categorizedVariables = emptyCategorizedVariables,
    categorizedSources = emptyCategorizedSources,
    sourceDataVersion,
    stepId,
}: {
    children: ReactNode;
    stepData: any;
    loopData?: any;
    readOnly?: boolean;
    canExecute?: boolean;
    categorizedVariables?: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    sourceDataVersion?: number;
    stepId?: string;
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
        stepData, loopData, readOnly, credentialKeys, canExecute, categorizedVariables, categorizedSources, sourceDataVersion, stepId
    }), [stepData, loopData, readOnly, credentialKeys, canExecute, categorizedVariables, categorizedSources, sourceDataVersion, stepId]);

    return (
        <TemplateContext.Provider value={value}>
            {children}
        </TemplateContext.Provider>
    );
}

export function useTemplateContext() {
    return useContext(TemplateContext);
}


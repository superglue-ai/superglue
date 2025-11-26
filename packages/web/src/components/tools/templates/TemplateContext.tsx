import { createContext, useContext, ReactNode, useMemo } from 'react';

interface TemplateContextValue {
    stepData: any;
    loopData?: any;
    readOnly: boolean;
    credentialKeys?: Set<string>;
    canExecute?: boolean;
    availableVariables: string[];
}

const TemplateContext = createContext<TemplateContextValue>({
    stepData: {},
    loopData: undefined,
    readOnly: false,
    credentialKeys: undefined,
    canExecute: true,
    availableVariables: [],
});

export function TemplateContextProvider({
    children,
    stepData,
    loopData,
    readOnly = false,
    canExecute = true,
}: {
    children: ReactNode;
    stepData: any;
    loopData?: any;
    readOnly?: boolean;
    canExecute?: boolean;
}) {
    const credentialKeys = stepData && typeof stepData === 'object'
        ? new Set(
            Object.keys(stepData).filter(key => {
                const value = stepData[key];
                if (typeof value === 'string' && value.length > 0) {
                    const pattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*_[a-zA-Z0-9_$]+$/;
                    return pattern.test(key);
                }
                return false;
            })
        )
        : undefined;

    const availableVariables = useMemo(() => {
        if (!stepData || typeof stepData !== 'object') return [];
        return Object.keys(stepData).sort();
    }, [stepData]);

    return (
        <TemplateContext.Provider value={{ stepData, loopData, readOnly, credentialKeys, canExecute, availableVariables }}>
            {children}
        </TemplateContext.Provider>
    );
}

export function useTemplateContext() {
    return useContext(TemplateContext);
}


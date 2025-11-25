import { createContext, useContext, ReactNode } from 'react';

interface TemplateContextValue {
    stepData: any;
    loopData?: any;
    readOnly: boolean;
}

const TemplateContext = createContext<TemplateContextValue>({
    stepData: {},
    loopData: undefined,
    readOnly: false,
});

export function TemplateContextProvider({
    children,
    stepData,
    loopData,
    readOnly = false,
}: {
    children: ReactNode;
    stepData: any;
    loopData?: any;
    readOnly?: boolean;
}) {
    return (
        <TemplateContext.Provider value={{ stepData, loopData, readOnly }}>
            {children}
        </TemplateContext.Provider>
    );
}

export function useTemplateContext() {
    return useContext(TemplateContext);
}


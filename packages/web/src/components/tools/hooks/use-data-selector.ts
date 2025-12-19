import { assertValidArrowFunction, executeWithVMHelpers } from '@superglue/shared';
import { useEffect, useRef, useState } from 'react';

const DATA_SELECTOR_DEBOUNCE_MS = 400;

const dataSelectorOutputCache = new Map<string, { output: any; error: string | null }>();
let lastSeenDataSelectorVersion: number | undefined = undefined;

interface UseDataSelectorOptions {
    stepId: string;
    loopSelector: string | undefined;
    evolvingPayload: Record<string, any>;
    sourceDataVersion: number;
    onDataSelectorChange?: (itemCount: number | null, isInitial: boolean) => void;
}

interface UseDataSelectorResult {
    dataSelectorOutput: any | null;
    dataSelectorError: string | null;
}

export function useDataSelector({
    stepId,
    loopSelector,
    evolvingPayload,
    sourceDataVersion,
    onDataSelectorChange,
}: UseDataSelectorOptions): UseDataSelectorResult {
    const [dataSelectorOutput, setDataSelectorOutput] = useState<any | null>(null);
    const [dataSelectorError, setDataSelectorError] = useState<string | null>(null);
    const lastEvalTimerRef = useRef<number | null>(null);
    const lastNotifiedStepIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (sourceDataVersion !== lastSeenDataSelectorVersion) {
            dataSelectorOutputCache.clear();
            lastSeenDataSelectorVersion = sourceDataVersion;
        }
        
        const cacheKey = `${stepId}:${sourceDataVersion}:${loopSelector}`;
        const cached = dataSelectorOutputCache.get(cacheKey);
        if (cached) {
            setDataSelectorOutput(cached.output);
            setDataSelectorError(cached.error);
        }
    }, [stepId, sourceDataVersion, loopSelector]);

    useEffect(() => {
        if (lastEvalTimerRef.current) {
            window.clearTimeout(lastEvalTimerRef.current);
            lastEvalTimerRef.current = null;
        }
        setDataSelectorError(null);
        
        const cacheKey = `${stepId}:${sourceDataVersion}:${loopSelector}`;
        
        const timerId = window.setTimeout(() => {
            try {
                assertValidArrowFunction(loopSelector);
                const out = executeWithVMHelpers(loopSelector, evolvingPayload || {});
                
                if (typeof out === 'function') {
                    throw new Error('Data selector returned a function. Did you forget to call it?');
                }
                const normalizedOut = out === undefined ? null : out;
                dataSelectorOutputCache.set(cacheKey, { output: normalizedOut, error: null });
                setDataSelectorOutput(normalizedOut);
                setDataSelectorError(null);
            } catch (err: any) {
                setDataSelectorOutput(null);
                let errorMessage = 'Error evaluating data selector';
                if (err) {
                    if (err instanceof Error) {
                        errorMessage = err.message || errorMessage;
                    } else if (typeof err === 'string') {
                        errorMessage = err;
                    } else if (err?.message && typeof err.message === 'string') {
                        errorMessage = err.message;
                    } else {
                        errorMessage = String(err);
                    }
                }
                dataSelectorOutputCache.set(cacheKey, { output: null, error: errorMessage });
                setDataSelectorError(errorMessage);
            }
        }, DATA_SELECTOR_DEBOUNCE_MS);
        
        lastEvalTimerRef.current = timerId as unknown as number;
        
        return () => { 
            if (lastEvalTimerRef.current) { 
                window.clearTimeout(lastEvalTimerRef.current); 
                lastEvalTimerRef.current = null; 
            } 
        };
    }, [stepId, loopSelector, evolvingPayload, sourceDataVersion]);

    useEffect(() => {
        const hasValidOutput = !dataSelectorError && dataSelectorOutput != null;
        const isInitialForThisStep = lastNotifiedStepIdRef.current !== stepId;
        
        const itemCount = (hasValidOutput && Array.isArray(dataSelectorOutput)) ? dataSelectorOutput.length : null;
        onDataSelectorChange?.(itemCount, isInitialForThisStep);
        
        if (isInitialForThisStep) {
            lastNotifiedStepIdRef.current = stepId;
        }
    }, [dataSelectorOutput, dataSelectorError, onDataSelectorChange, stepId]);

    return { dataSelectorOutput, dataSelectorError };
}


import { assertValidArrowFunction, executeWithVMHelpers } from '@superglue/shared';
import { useEffect, useRef, useState } from 'react';
import { useExecution } from '../context';

const DATA_SELECTOR_DEBOUNCE_MS = 400;

interface CacheEntry {
    evolvingPayloadRef: any;
    loopSelector: string;
    output: any;
    error: string | null;
}

const dataSelectorCache = new Map<string, CacheEntry>();

interface UseDataSelectorOptions {
    stepId: string;
    loopSelector: string | undefined;
    onDataSelectorChange?: (itemCount: number | null, isInitial: boolean) => void;
}

interface UseDataSelectorResult {
    dataSelectorOutput: any | null;
    dataSelectorError: string | null;
}

export function useDataSelector({
    stepId,
    loopSelector,
    onDataSelectorChange,
}: UseDataSelectorOptions): UseDataSelectorResult {
    const { getEvolvingPayload } = useExecution();
    const evolvingPayload = getEvolvingPayload(stepId);
    
    const [output, setOutput] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<number | null>(null);
    const lastNotifiedStepIdRef = useRef<string | null>(null);

    useEffect(() => {
        const cached = dataSelectorCache.get(stepId);
        if (
            cached &&
            cached.evolvingPayloadRef === evolvingPayload &&
            cached.loopSelector === (loopSelector ?? '')
        ) {
            setOutput(cached.output);
            setError(cached.error);
            return;
        }

        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        
        setError(null);

        timerRef.current = window.setTimeout(() => {
            try {
                assertValidArrowFunction(loopSelector);
                const result = executeWithVMHelpers(loopSelector, evolvingPayload || {});
                
                if (typeof result === 'function') {
                    throw new Error('Data selector returned a function. Did you forget to call it?');
                }
                
                const normalizedOutput = result === undefined ? null : result;
                
                dataSelectorCache.set(stepId, {
                    evolvingPayloadRef: evolvingPayload,
                    loopSelector: loopSelector ?? '',
                    output: normalizedOutput,
                    error: null,
                });
                
                setOutput(normalizedOutput);
                setError(null);
            } catch (err: any) {
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
                
                dataSelectorCache.set(stepId, {
                    evolvingPayloadRef: evolvingPayload,
                    loopSelector: loopSelector ?? '',
                    output: null,
                    error: errorMessage,
                });
                
                setOutput(null);
                setError(errorMessage);
            }
        }, DATA_SELECTOR_DEBOUNCE_MS) as unknown as number;

        return () => {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [stepId, loopSelector, evolvingPayload]);

    useEffect(() => {
        const isInitial = lastNotifiedStepIdRef.current !== stepId;
        const hasValidOutput = !error && output != null;
        const itemCount = hasValidOutput && Array.isArray(output) ? output.length : null;
        onDataSelectorChange?.(itemCount, isInitial);
        if (isInitial) {
            lastNotifiedStepIdRef.current = stepId;
        }
    }, [output, error, stepId, onDataSelectorChange]);

    return { dataSelectorOutput: output, dataSelectorError: error };
}

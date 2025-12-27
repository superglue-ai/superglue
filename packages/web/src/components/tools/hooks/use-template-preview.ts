import { useEffect, useRef, useState } from 'react';
import { evaluateTemplate, DEFAULT_CODE_TEMPLATE } from '@/src/lib/templating-utils';

interface CacheEntry {
    value: any;
    error: string | null;
}

const templateCache = new Map<string, CacheEntry>();

interface UseTemplatePreviewOptions {
    enabled?: boolean;
    debounceMs?: number;
    stepId?: string;
    sourceDataVersion?: number;
}

interface UseTemplatePreviewResult {
    previewValue: any;
    previewError: string | null;
    isEvaluating: boolean;
    hasResult: boolean;
}

export function useTemplatePreview(
    expression: string,
    sourceData: any,
    options: UseTemplatePreviewOptions = {}
): UseTemplatePreviewResult {
    const { enabled = true, debounceMs = 500, stepId = 'global', sourceDataVersion = 0 } = options;
    
    const cacheKey = `${stepId}:${expression}:v${sourceDataVersion}`;
    const cached = templateCache.get(cacheKey);
    
    const [previewValue, setPreviewValue] = useState<any>(cached?.value);
    const [previewError, setPreviewError] = useState<string | null>(cached?.error ?? null);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [hasResult, setHasResult] = useState(!!cached);
    const evalVersionRef = useRef(0);
    const sourceDataRef = useRef(sourceData);
    sourceDataRef.current = sourceData;

    useEffect(() => {
        if (!enabled) return;

        if (expression === DEFAULT_CODE_TEMPLATE) {
            setPreviewValue(undefined);
            setPreviewError(null);
            setIsEvaluating(false);
            setHasResult(true);
            return;
        }

        const cacheKey = `${stepId}:${expression}:v${sourceDataVersion}`;
        const cached = templateCache.get(cacheKey);
        
        if (cached) {
            setPreviewValue(cached.value);
            setPreviewError(cached.error);
            setHasResult(true);
            setIsEvaluating(false);
            return;
        }

        setHasResult(false);
        setIsEvaluating(true);
        evalVersionRef.current += 1;
        const thisVersion = evalVersionRef.current;

        const timer = setTimeout(async () => {
            if (thisVersion !== evalVersionRef.current) return;

            try {
                const result = await evaluateTemplate(expression, sourceDataRef.current);
                if (thisVersion !== evalVersionRef.current) return;

                const entry: CacheEntry = result.success
                    ? { value: result.value, error: null }
                    : { value: undefined, error: result.error || 'Evaluation failed' };

                templateCache.set(cacheKey, entry);
                setPreviewValue(entry.value);
                setPreviewError(entry.error);
                setHasResult(true);
            } catch (err) {
                if (thisVersion !== evalVersionRef.current) return;
                const errorMsg = err instanceof Error ? err.message : String(err);
                const entry: CacheEntry = { value: undefined, error: errorMsg };
                templateCache.set(cacheKey, entry);
                setPreviewValue(undefined);
                setPreviewError(errorMsg);
                setHasResult(true);
            } finally {
                if (thisVersion === evalVersionRef.current) {
                    setIsEvaluating(false);
                }
            }
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [expression, stepId, debounceMs, sourceDataVersion]);

    return { previewValue, previewError, isEvaluating, hasResult };
}

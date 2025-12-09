import { useEffect, useRef, useState } from 'react';
import { evaluateTemplate, DEFAULT_CODE_TEMPLATE } from '@/src/lib/templating-utils';

interface EvaluationCacheEntry {
  value: any;
  error: string | null;
}

const evaluationCache = new Map<string, EvaluationCacheEntry>();

function getCacheKey(codeContent: string, sourceDataVersion?: number, stepId?: string): string {
  return `${stepId ?? 'global'}:${sourceDataVersion ?? 'none'}:${codeContent}`;
}

function cleanupStaleEntries(currentVersion: number | undefined) {
  for (const key of evaluationCache.keys()) {
    const versionPart = key.split(':')[1];
    if (versionPart !== String(currentVersion ?? 'none')) {
      evaluationCache.delete(key);
    }
  }
}

interface UseTemplatePreviewOptions {
  enabled?: boolean;
  debounceMs?: number;
  sourceDataVersion?: number;
  stepId?: string;
}

interface UseTemplatePreviewResult {
  previewValue: any;
  previewError: string | null;
  isEvaluating: boolean;
  hasResult: boolean;
}

export function useTemplatePreview(
  codeContent: string,
  sourceData: any,
  options: UseTemplatePreviewOptions = {}
): UseTemplatePreviewResult {
  const { enabled = true, debounceMs = 500, sourceDataVersion, stepId } = options;
  
  const isDefaultTemplate = codeContent === DEFAULT_CODE_TEMPLATE;
  const cacheKey = getCacheKey(codeContent, sourceDataVersion, stepId);
  const cached = isDefaultTemplate ? undefined : evaluationCache.get(cacheKey);
  
  const [previewValue, setPreviewValue] = useState<any>(cached?.value);
  const [previewError, setPreviewError] = useState<string | null>(cached?.error ?? null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hasResult, setHasResult] = useState(isDefaultTemplate || !!cached);
  
  const evalVersionRef = useRef(0);
  const sourceDataRef = useRef(sourceData);
  sourceDataRef.current = sourceData;

  useEffect(() => {
    if (!enabled) {
      setIsEvaluating(false);
      return;
    }

    if (codeContent === DEFAULT_CODE_TEMPLATE) {
      setPreviewValue(undefined);
      setPreviewError(null);
      setIsEvaluating(false);
      setHasResult(true);
      return;
    }

    const cached = evaluationCache.get(cacheKey);
    
    if (cached) {
      setPreviewValue(cached.value);
      setPreviewError(cached.error);
      setHasResult(true);
      setIsEvaluating(false);
      return;
    }
    
    setHasResult(false);
    setPreviewError(null);
    setIsEvaluating(true);
    
    evalVersionRef.current += 1;
    const thisVersion = evalVersionRef.current;

    const timer = setTimeout(async () => {
      if (thisVersion !== evalVersionRef.current) return;
      
      try {
        const result = await evaluateTemplate(codeContent, sourceDataRef.current);
        if (thisVersion !== evalVersionRef.current) return;
        
        const cacheEntry: EvaluationCacheEntry = result.success 
          ? { value: result.value, error: null }
          : { value: undefined, error: result.error || 'Evaluation failed' };
        
        cleanupStaleEntries(sourceDataVersion);
        evaluationCache.set(cacheKey, cacheEntry);
        
        setPreviewValue(cacheEntry.value);
        setPreviewError(cacheEntry.error);
        setHasResult(true);
      } catch (error) {
        if (thisVersion !== evalVersionRef.current) return;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const cacheEntry: EvaluationCacheEntry = { value: undefined, error: errorMsg };
        
        cleanupStaleEntries(sourceDataVersion);
        evaluationCache.set(cacheKey, cacheEntry);
        
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
  }, [codeContent, sourceDataVersion, stepId, enabled, debounceMs]);

  return { previewValue, previewError, isEvaluating, hasResult };
}

import { useEffect, useRef, useState } from 'react';
import { evaluateTemplate, DEFAULT_CODE_TEMPLATE } from '@/src/lib/templating-utils';

interface EvaluationCacheEntry {
  value: any;
  error: string | null;
}

let lastSeenVersion: number | undefined = undefined;
const evaluationCache = new Map<string, EvaluationCacheEntry>();

function getCacheKey(codeContent: string, sourceDataVersion?: number): string {
  return `${sourceDataVersion ?? 'none'}:${codeContent}`;
}

interface UseTemplatePreviewOptions {
  enabled?: boolean;
  debounceMs?: number;
  sourceDataVersion?: number;
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
  const { enabled = true, debounceMs = 500, sourceDataVersion } = options;
  
  if (sourceDataVersion !== lastSeenVersion) {
    evaluationCache.clear();
    lastSeenVersion = sourceDataVersion;
  }
  
  const cacheKey = getCacheKey(codeContent, sourceDataVersion);
  const cached = evaluationCache.get(cacheKey);
  
  const [previewValue, setPreviewValue] = useState<any>(cached?.value);
  const [previewError, setPreviewError] = useState<string | null>(cached?.error ?? null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hasResult, setHasResult] = useState(!!cached);
  
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
    
    evalVersionRef.current += 1;
    const thisVersion = evalVersionRef.current;

    const timer = setTimeout(async () => {
      if (thisVersion !== evalVersionRef.current) return;
      
      setIsEvaluating(true);
      setHasResult(false);
      
      try {
        const result = await evaluateTemplate(codeContent, sourceDataRef.current);
        if (thisVersion !== evalVersionRef.current) return;
        
        const cacheEntry: EvaluationCacheEntry = result.success 
          ? { value: result.value, error: null }
          : { value: undefined, error: result.error || 'Evaluation failed' };
        
        evaluationCache.set(cacheKey, cacheEntry);
        
        setPreviewValue(cacheEntry.value);
        setPreviewError(cacheEntry.error);
        setHasResult(true);
      } catch (error) {
        if (thisVersion !== evalVersionRef.current) return;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const cacheEntry: EvaluationCacheEntry = { value: undefined, error: errorMsg };
        
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
  }, [codeContent, sourceDataVersion, enabled, debounceMs]);

  return { previewValue, previewError, isEvaluating, hasResult };
}

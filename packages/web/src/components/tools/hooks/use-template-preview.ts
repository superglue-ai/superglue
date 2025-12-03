import { useEffect, useRef, useState } from 'react';
import { evaluateTemplate, DEFAULT_CODE_TEMPLATE } from '@/src/lib/templating-utils';

interface UseTemplatePreviewOptions {
  enabled?: boolean;
  debounceMs?: number;
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
  const { enabled = true, debounceMs = 500 } = options;
  
  const [previewValue, setPreviewValue] = useState<any>(undefined);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  
  const lastCodeRef = useRef<string>('');
  const lastSourceDataRef = useRef<any>(null);
  const evalVersionRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setIsEvaluating(false);
      return;
    }

    if (codeContent === DEFAULT_CODE_TEMPLATE) {
      setPreviewValue(undefined);
      setPreviewError(null);
      setIsEvaluating(false);
      setHasResult(false);
      lastCodeRef.current = codeContent;
      lastSourceDataRef.current = sourceData;
      return;
    }

    const isCacheHit = codeContent === lastCodeRef.current && sourceData === lastSourceDataRef.current;
    
    if (isCacheHit) {
      setHasResult(true);
      setIsEvaluating(false);
      lastCodeRef.current = codeContent;
      lastSourceDataRef.current = sourceData;
      return;
    }
    
    evalVersionRef.current += 1;
    const thisVersion = evalVersionRef.current;

    const timer = setTimeout(async () => {
      if (thisVersion !== evalVersionRef.current) return;
      
      setHasResult(false);
      setIsEvaluating(true);
      
      try {
        const result = await evaluateTemplate(codeContent, sourceData);
        if (thisVersion !== evalVersionRef.current) return;
        
        lastCodeRef.current = codeContent;
        lastSourceDataRef.current = sourceData;
        
        if (result.success) {
          setPreviewValue(result.value);
          setPreviewError(null);
        } else {
          setPreviewValue(undefined);
          setPreviewError(result.error || 'Evaluation failed');
        }
        setHasResult(true);
      } catch (error) {
        if (thisVersion !== evalVersionRef.current) return;
        setPreviewValue(undefined);
        setPreviewError(error instanceof Error ? error.message : String(error));
        setHasResult(true);
      } finally {
        if (thisVersion === evalVersionRef.current) {
          setIsEvaluating(false);
        }
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [codeContent, sourceData, enabled, debounceMs]);

  return { previewValue, previewError, isEvaluating, hasResult };
}

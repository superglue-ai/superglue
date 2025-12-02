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
  const lastCodeRef = useRef<string>('');
  const lastSourceDataRef = useRef<any>(null);
  const evalVersionRef = useRef(0);

  const hasSourceData = sourceData && typeof sourceData === 'object' && Object.keys(sourceData).length > 0;

  useEffect(() => {
    if (!enabled || !hasSourceData) {
      setPreviewValue(undefined);
      setPreviewError(null);
      setIsEvaluating(false);
      return;
    }

    if (codeContent === DEFAULT_CODE_TEMPLATE) {
      setPreviewValue(undefined);
      setPreviewError(null);
      setIsEvaluating(false);
      lastCodeRef.current = codeContent;
      lastSourceDataRef.current = sourceData;
      return;
    }

    if (codeContent === lastCodeRef.current && sourceData === lastSourceDataRef.current) {
      return;
    }

    evalVersionRef.current += 1;
    const thisVersion = evalVersionRef.current;

    const timer = setTimeout(async () => {
      if (thisVersion !== evalVersionRef.current) return;
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
      } catch (error) {
        if (thisVersion !== evalVersionRef.current) return;
        setPreviewValue(undefined);
        setPreviewError(error instanceof Error ? error.message : String(error));
      } finally {
        if (thisVersion === evalVersionRef.current) {
          setIsEvaluating(false);
        }
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [codeContent, sourceData, enabled, hasSourceData, debounceMs]);

  useEffect(() => {
    lastCodeRef.current = '';
    lastSourceDataRef.current = null;
  }, [enabled]);

  return { previewValue, previewError, isEvaluating };
}

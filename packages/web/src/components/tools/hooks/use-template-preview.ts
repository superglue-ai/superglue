import { useEffect, useRef, useState, useMemo } from 'react';
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

function getSourceDataKey(data: any): string {
  if (!data || typeof data !== 'object') return '';
  try {
    return JSON.stringify(data);
  } catch {
    return String(Object.keys(data).length);
  }
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
  const lastEvalKeyRef = useRef<string>('');
  const evalVersionRef = useRef(0);

  const hasSourceData = sourceData && typeof sourceData === 'object' && Object.keys(sourceData).length > 0;
  const sourceDataKey = useMemo(() => getSourceDataKey(sourceData), [sourceData]);

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
      lastEvalKeyRef.current = `${codeContent}:${sourceDataKey}`;
      return;
    }

    const evalKey = `${codeContent}:${sourceDataKey}`;
    if (evalKey === lastEvalKeyRef.current) {
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
        lastEvalKeyRef.current = evalKey;
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
  }, [codeContent, sourceDataKey, sourceData, enabled, hasSourceData, debounceMs]);

  useEffect(() => {
    lastEvalKeyRef.current = '';
  }, [enabled]);

  return { previewValue, previewError, isEvaluating };
}

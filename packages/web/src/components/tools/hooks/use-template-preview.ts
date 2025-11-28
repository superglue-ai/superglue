import { useEffect, useRef, useState } from 'react';
import { evaluateTemplate, DEFAULT_CODE_TEMPLATE } from '@/src/lib/template-utils';

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
  
  const [previewValue, setPreviewValue] = useState<any>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const lastEvaluatedCodeRef = useRef<string>('');

  const hasSourceData = sourceData && typeof sourceData === 'object' && Object.keys(sourceData).length > 0;

  useEffect(() => {
    if (!enabled || !hasSourceData) {
      setPreviewError(null);
      setIsEvaluating(false);
      return;
    }

    if (codeContent === DEFAULT_CODE_TEMPLATE) {
      setPreviewValue({});
      setPreviewError(null);
      setIsEvaluating(false);
      lastEvaluatedCodeRef.current = codeContent;
      return;
    }

    if (codeContent === lastEvaluatedCodeRef.current) {
      return;
    }

    setIsEvaluating(true);

    const timer = setTimeout(async () => {
      try {
        const result = await evaluateTemplate(codeContent, sourceData);
        lastEvaluatedCodeRef.current = codeContent;
        if (result.success) {
          setPreviewValue(result.value);
          setPreviewError(null);
        } else {
          setPreviewError(result.error || 'Evaluation failed');
        }
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsEvaluating(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [codeContent, sourceData, enabled, hasSourceData, debounceMs]);

  useEffect(() => {
    lastEvaluatedCodeRef.current = '';
  }, [enabled]);

  return { previewValue, previewError, isEvaluating };
}


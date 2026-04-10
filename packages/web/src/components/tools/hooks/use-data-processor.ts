import { useMemo } from "react";
import { useComputeWorkerCached } from "@/src/hooks/use-compute-worker-cached";
import { TaskType } from "@/src/workers/compute-worker";

interface CachedData {
  displayString: string;
  truncated: boolean;
}

interface PreviewResult {
  displayString: string;
  truncated: boolean;
  bytes: number;
}

interface UseDataProcessorResult {
  preview: CachedData | null;
  bytes: number;
  isComputingPreview: boolean;
  error: string | null;
}

export function useDataProcessor(data: any, isActive: boolean): UseDataProcessorResult {
  const previewCompute = useComputeWorkerCached<PreviewResult>(
    TaskType.COMPUTE_PREVIEW,
    data,
    isActive,
  );

  const preview: CachedData | null = useMemo(
    () =>
      previewCompute.result
        ? {
            displayString: previewCompute.result.displayString,
            truncated: previewCompute.result.truncated,
          }
        : null,
    [previewCompute.result],
  );

  const bytes = previewCompute.result?.bytes || 0;

  return {
    preview,
    bytes,
    isComputingPreview: previewCompute.isComputing,
    error: previewCompute.error,
  };
}

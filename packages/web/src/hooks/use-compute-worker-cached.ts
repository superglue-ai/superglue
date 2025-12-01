import { useEffect, useRef, useState } from 'react';
import { workerManager } from '@/src/workers/worker-manager';
import { getDataHash } from '@/src/lib/weak-cache';
import type { TaskType } from '@/src/workers/compute-worker';

interface UseWorkerComputeResult<T> {
  result: T | null;
  isComputing: boolean;
  error: string | null;
}

export function useComputeWorkerCached<T = any>(
  taskType: TaskType,
  data: any,
  isActive: boolean
): UseWorkerComputeResult<T> {
  const [result, setResult] = useState<T | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastDataHashRef = useRef<string>('');
  const lastDataRef = useRef<any>(null);

  useEffect(() => {
    if (data === null || data === undefined || !isActive) {
      return;
    }

    const currentHash = getDataHash(data);
    if (currentHash === lastDataHashRef.current) {
      return;
    }

    lastDataHashRef.current = currentHash;
    lastDataRef.current = data;

    // Check cache first (use the actual data reference for cache lookup)
    const cached = workerManager.getCached(data, taskType);
    if (cached !== null) {
      setResult(cached);
      setIsComputing(false);
      return;
    }

    setIsComputing(true);
    setError(null);

    workerManager
      .compute<T>(taskType, data)
      .then((computedResult) => {
        setResult(computedResult);
        setIsComputing(false);
      })
      .catch((err) => {
        setError(err.message || 'Computation failed');
        setIsComputing(false);
      });
  }, [data, taskType, isActive]);

  return {
    result,
    isComputing,
    error,
  };
}


import { useCallback, useMemo, useRef, useState } from 'react';
import { useComputeWorkerCached } from '@/src/hooks/use-compute-worker-cached';
import { getDataHash } from '@/src/lib/weak-cache';
import { TaskType } from '@/src/workers/compute-worker';

interface CachedData {
    displayString: string;
    truncated: boolean;
}

interface PreviewResult {
    displayString: string;
    truncated: boolean;
    bytes: number;
}

interface SchemaResult {
    schema: any;
    displayString: string;
    truncated: boolean;
}

interface UseDataProcessorResult {
    preview: CachedData | null;
    schema: CachedData | null;
    bytes: number;
    isComputingPreview: boolean;
    isComputingSchema: boolean;
    error: string | null;
    computeSchema: () => void;
}

export function useDataProcessor(
    data: any,
    isActive: boolean
): UseDataProcessorResult {
    const [schemaTriggered, setSchemaTriggered] = useState(false);
    const schemaComputedRef = useRef(false);

    const previewCompute = useComputeWorkerCached<PreviewResult>(
        TaskType.COMPUTE_PREVIEW,
        data,
        isActive
    );

    const schemaCompute = useComputeWorkerCached<SchemaResult>(
        TaskType.COMPUTE_SCHEMA,
        data,
        schemaTriggered && isActive
    );

    // Lazy schema computation callback
    const computeSchema = useCallback(() => {
        if (schemaComputedRef.current || schemaCompute.isComputing) {
            return;
        }

        setSchemaTriggered(true);
        schemaComputedRef.current = true;
    }, [schemaCompute.isComputing]);

    const lastDataHashRef = useRef<string>('');
    const currentHash = useMemo(() => (data && isActive) ? getDataHash(data) : '', [data, isActive]);
    if (lastDataHashRef.current !== currentHash) {
        lastDataHashRef.current = currentHash;
        setSchemaTriggered(false);
        schemaComputedRef.current = false;
    }

    const preview: CachedData | null = previewCompute.result
        ? {
            displayString: previewCompute.result.displayString,
            truncated: previewCompute.result.truncated,
        }
        : null;

    const schema: CachedData | null = schemaCompute.result
        ? {
            displayString: schemaCompute.result.displayString,
            truncated: schemaCompute.result.truncated,
        }
        : null;

    const bytes = previewCompute.result?.bytes || 0;

    return {
        preview,
        schema,
        bytes,
        isComputingPreview: previewCompute.isComputing,
        isComputingSchema: schemaCompute.isComputing,
        error: previewCompute.error || schemaCompute.error,
        computeSchema,
    };
}

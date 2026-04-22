import { resolveFileInputBindings, validateFileReferences } from "@/src/lib/agent/agent-helpers";
import { abortExecution, generateUUID, shouldDebounceAbort } from "@/src/lib/client-utils";
import { useSuperglueClient } from "@/src/queries/use-client";
import { ExecutionFileEnvelope, Tool, ToolCall } from "@superglue/shared";
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";

export interface RunResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ExecuteToolOptions {
  toolConfig: Tool;
  overridePayload?: Record<string, any>;
  onFailure?: (result: RunResult) => void;
  onSuccess?: (result: RunResult) => void;
}

interface UseToolExecutionOptions {
  tool: ToolCall;
  editablePayload: string;
  filePayloads?: Record<string, any>;
}

interface UseToolExecutionReturn {
  isRunning: boolean;
  runResult: RunResult | null;
  setRunResult: Dispatch<SetStateAction<RunResult | null>>;
  manualRunLogs: Array<{ message: string; timestamp: Date }>;
  executeToolConfig: (options: ExecuteToolOptions) => Promise<void>;
  handleStopExecution: () => Promise<void>;
}

export function useToolExecution({
  tool,
  editablePayload,
  filePayloads,
}: UseToolExecutionOptions): UseToolExecutionReturn {
  const createClient = useSuperglueClient();

  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [manualRunLogs, setManualRunLogs] = useState<Array<{ message: string; timestamp: Date }>>(
    [],
  );

  const currentRunIdRef = useRef<string | null>(null);
  const lastAbortTimeRef = useRef<number>(0);
  const logSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (logSubscriptionRef.current) {
        logSubscriptionRef.current.unsubscribe();
        logSubscriptionRef.current = null;
      }
    };
  }, []);

  const handleStopExecution = useCallback(async () => {
    if (shouldDebounceAbort(lastAbortTimeRef.current)) return;
    if (!currentRunIdRef.current) return;

    lastAbortTimeRef.current = Date.now();
    const client = createClient();
    const success = await abortExecution(client, currentRunIdRef.current);

    if (success) {
      currentRunIdRef.current = null;
      setIsRunning(false);
      setRunResult(null);
      if (logSubscriptionRef.current) {
        logSubscriptionRef.current.unsubscribe();
        logSubscriptionRef.current = null;
      }
    }
  }, [createClient]);

  const executeToolConfig = useCallback(
    async (options: ExecuteToolOptions) => {
      const { toolConfig, overridePayload, onFailure, onSuccess } = options;

      const runId = generateUUID();
      currentRunIdRef.current = runId;
      setIsRunning(true);
      setRunResult(null);
      setManualRunLogs([]);

      const client = createClient();

      try {
        const subscription = await client.subscribeToLogsSSE({
          traceId: runId,
          onLog: (log) => {
            setManualRunLogs((prev) => [
              ...prev,
              { message: log.message, timestamp: log.timestamp },
            ]);
          },
          includeDebug: true,
        });
        logSubscriptionRef.current = subscription;
      } catch (e) {
        console.warn("Could not subscribe to logs:", e);
      }

      const cleanup = () => {
        currentRunIdRef.current = null;
        setIsRunning(false);
        if (logSubscriptionRef.current) {
          logSubscriptionRef.current.unsubscribe();
          logSubscriptionRef.current = null;
        }
      };

      const handleFailure = (errorMsg: string) => {
        const failResult: RunResult = { success: false, error: errorMsg };
        if (onFailure) {
          onFailure(failResult);
        }
      };

      let runPayload = overridePayload || tool.input?.payload || {};
      if (!overridePayload) {
        try {
          if (editablePayload.trim()) {
            runPayload = JSON.parse(editablePayload);
          }
        } catch {}
      }

      const resolvedFileBindings = resolveFileInputBindings(tool.input?.files, filePayloads);
      if (resolvedFileBindings.success === false) {
        const errorMsg = resolvedFileBindings.error;
        setRunResult({ success: false, error: errorMsg });
        cleanup();
        handleFailure(errorMsg);
        return;
      }

      const availableExecutionFiles = {
        ...(filePayloads || {}),
        ...(resolvedFileBindings.resolved as Record<string, ExecutionFileEnvelope>),
      };
      const validation = validateFileReferences(runPayload, availableExecutionFiles);
      if (validation.valid === false) {
        const errorMsg = `Missing files: ${validation.missingFiles.join(", ")}. ${validation.availableKeys.length > 0 ? `Available: ${validation.availableKeys.join(", ")}` : "No files uploaded in this session."}`;
        setRunResult({ success: false, error: errorMsg });
        cleanup();
        handleFailure(errorMsg);
        return;
      }

      const executionFiles = {
        ...availableExecutionFiles,
      };

      try {
        const result = await client.runToolConfig({
          tool: toolConfig,
          payload: runPayload,
          files: executionFiles,
          runId,
          traceId: runId,
        });

        if (currentRunIdRef.current !== runId) return;

        const runResultValue: RunResult = {
          success: result.success,
          data: result.data,
          error: result.error,
        };
        setRunResult(runResultValue);

        if (result.success) {
          if (onSuccess) {
            onSuccess(runResultValue);
          }
        } else {
          const truncatedError =
            result.error && result.error.length > 500
              ? `${result.error.slice(0, 500)}...`
              : result.error;
          handleFailure(truncatedError || "Unknown error");
        }
      } catch (error: any) {
        if (currentRunIdRef.current !== runId) return;
        console.error("[useToolExecution] runToolConfig error:", error);
        console.error("[useToolExecution] error stack:", error.stack);
        const errorMsg = error.message || "Execution failed";
        setRunResult({ success: false, error: errorMsg });
        handleFailure(errorMsg);
      } finally {
        if (currentRunIdRef.current === runId) {
          currentRunIdRef.current = null;
          setIsRunning(false);
        }
        if (logSubscriptionRef.current) {
          setTimeout(() => {
            logSubscriptionRef.current?.unsubscribe();
            logSubscriptionRef.current = null;
          }, 500);
        }
      }
    },
    [createClient, filePayloads, tool.input?.payload, editablePayload],
  );

  return {
    isRunning,
    runResult,
    setRunResult,
    manualRunLogs,
    executeToolConfig,
    handleStopExecution,
  };
}

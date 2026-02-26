import { useConfig } from "@/src/app/config-context";
import { UserAction } from "@/src/lib/agent/agent-types";
import { resolveFileReferences, validateFileReferences } from "@/src/lib/agent/agent-helpers";
import {
  abortExecution,
  createSuperglueClient,
  generateUUID,
  shouldDebounceAbort,
} from "@/src/lib/client-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { SuperglueClient, Tool, ToolCall } from "@superglue/shared";
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";

export interface RunResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ExecuteToolOptions {
  toolConfig: Tool;
  appliedChangesCount?: number;
  overridePayload?: Record<string, any>;
  toolNameForFeedback: string;
  toolIdForFeedback?: string;
  onFailure?: (result: RunResult) => void;
  onSuccess?: (result: RunResult) => void;
}

interface UseToolExecutionOptions {
  tool: ToolCall;
  editablePayload: string;
  filePayloads?: Record<string, any>;
  bufferAction?: (action: UserAction) => void;
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
  bufferAction,
}: UseToolExecutionOptions): UseToolExecutionReturn {
  const config = useConfig();

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
    const client = createSuperglueClient(config.apiEndpoint);
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
  }, [config.apiEndpoint, config.apiEndpoint]);

  const executeToolConfig = useCallback(
    async (options: ExecuteToolOptions) => {
      const {
        toolConfig,
        appliedChangesCount = 0,
        overridePayload,
        toolNameForFeedback,
        toolIdForFeedback,
        onFailure,
        onSuccess,
      } = options;

      const runId = generateUUID();
      currentRunIdRef.current = runId;
      setIsRunning(true);
      setRunResult(null);
      setManualRunLogs([]);

      const client = new SuperglueClient({
        endpoint: config.apiEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

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
        } else if (bufferAction) {
          bufferAction({
            type: "tool_event",
            toolCallId: tool.id,
            toolName: tool.name,
            event: "manual_run_failure",
            payload: {
              toolId: toolIdForFeedback,
              error: errorMsg,
              appliedChanges: appliedChangesCount,
            },
          });
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

      const validation = validateFileReferences(runPayload, filePayloads || {});
      if (validation.valid === false) {
        const errorMsg = `Missing files: ${validation.missingFiles.join(", ")}. ${validation.availableKeys.length > 0 ? `Available: ${validation.availableKeys.join(", ")}` : "No files uploaded in this session."}`;
        setRunResult({ success: false, error: errorMsg });
        cleanup();
        handleFailure(errorMsg);
        return;
      }

      if (filePayloads && Object.keys(filePayloads).length > 0) {
        try {
          runPayload = resolveFileReferences(runPayload, filePayloads);
        } catch (error: any) {
          const errorMsg = error.message || "Failed to resolve file references";
          setRunResult({ success: false, error: errorMsg });
          cleanup();
          handleFailure(errorMsg);
          return;
        }
      }

      try {
        const result = await client.runToolConfig({
          tool: toolConfig,
          payload: runPayload,
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
          } else if (bufferAction) {
            const truncatedResult =
              result.data !== undefined ? JSON.stringify(result.data).substring(0, 500) : undefined;
            bufferAction({
              type: "tool_event",
              toolCallId: tool.id,
              toolName: tool.name,
              event: "manual_run_success",
              payload: {
                toolId: toolIdForFeedback,
                result: truncatedResult,
                appliedChanges: appliedChangesCount,
              },
            });
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
    [
      config.apiEndpoint,
      config.apiEndpoint,
      filePayloads,
      tool.input?.payload,
      tool.id,
      tool.name,
      editablePayload,
      bufferAction,
    ],
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

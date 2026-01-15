"use client";
import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { useToolConfig } from "./tool-config-context";
import {
  ExecutionContextValue,
  StepExecutionState,
  StepStatus,
  TransformStatus,
  DEFAULT_STEP_EXECUTION,
  StepTemplateData,
  DataSelectorResult,
  CategorizedVariables,
  CategorizedSources,
  StepStatusInfo,
} from "./types";
import { buildStepInput, buildPreviousStepResults } from "@/src/lib/general-utils";
import {
  extractCredentials,
  deriveCurrentItem,
  buildPaginationData,
} from "@/src/lib/templating-utils";
import {
  ExecutionStep,
  flattenAndNamespaceCredentials,
  assertValidArrowFunction,
  executeWithVMHelpers,
} from "@superglue/shared";

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export function useExecution(): ExecutionContextValue {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error("useExecution must be used within an ExecutionProvider");
  }
  return context;
}

export function useExecutionOptional(): ExecutionContextValue | null {
  return useContext(ExecutionContext);
}

interface ExecutionProviderProps {
  children: ReactNode;
}

const DATA_SELECTOR_DEBOUNCE_MS = 400;

const emptyCategorizedVariables: CategorizedVariables = {
  credentials: [],
  toolInputs: [],
  fileInputs: [],
  currentStepData: [],
  previousStepData: [],
  paginationVariables: [],
};

const emptyCategorizedSources: CategorizedSources = {
  manualPayload: {},
  filePayloads: {},
  previousStepResults: {},
  currentItem: null,
  paginationData: {},
};

const emptyStepTemplateData: StepTemplateData = {
  sourceData: {},
  credentials: {},
  categorizedVariables: emptyCategorizedVariables,
  categorizedSources: emptyCategorizedSources,
  dataSelectorOutput: null,
  dataSelectorError: null,
  canExecute: false,
};

const STATUS_INFO = {
  running: {
    text: "Running",
    color: "text-amber-600 dark:text-amber-400",
    dotColor: "bg-amber-600 dark:bg-amber-400",
    animate: true,
  },
  fixing: {
    text: "Fixing",
    color: "text-amber-600 dark:text-amber-400",
    dotColor: "bg-amber-600 dark:bg-amber-400",
    animate: true,
  },
  completed: {
    text: "Completed",
    color: "text-muted-foreground",
    dotColor: "bg-green-600 dark:bg-green-400",
    animate: false,
  },
  failed: {
    text: "Failed",
    color: "text-red-600 dark:text-red-400",
    dotColor: "bg-red-600 dark:bg-red-400",
    animate: false,
  },
  pending: {
    text: "Pending",
    color: "text-gray-500 dark:text-gray-400",
    dotColor: "bg-gray-500 dark:bg-gray-400",
    animate: false,
  },
} as const satisfies Record<string, StepStatusInfo>;

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  const { steps, payload, integrations } = useToolConfig();

  const [stepExecutions, setStepExecutions] = useState<Record<string, StepExecutionState>>({});
  const [isExecutingAny, setIsExecutingAny] = useState(false);
  const [currentExecutingStepIndex, setCurrentExecutingStepIndexState] = useState<number | null>(
    null,
  );
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [finalResult, setFinalResultState] = useState<any | null>(null);
  const [finalError, setFinalErrorState] = useState<string | null>(null);
  const [transformStatus, setTransformStatusState] = useState<TransformStatus>("idle");

  const [dataSelectorResults, setDataSelectorResults] = useState<
    Record<string, DataSelectorResult>
  >({});
  const dataSelectorTimersRef = useRef<Record<string, number>>({});
  const dataSelectorCacheRef = useRef<
    Map<string, { version: number; loopSelector: string; result: DataSelectorResult }>
  >(new Map());

  const setStepResult = useCallback(
    (stepId: string, result: any, status: StepStatus, error?: string) => {
      setStepExecutions((prev) => ({
        ...prev,
        [stepId]: { status, result, error: error ?? null, runId: null },
      }));
    },
    [],
  );

  const setStepRunning = useCallback((stepId: string, runId: string) => {
    setStepExecutions((prev) => ({
      ...prev,
      [stepId]: { ...(prev[stepId] ?? DEFAULT_STEP_EXECUTION), status: "running", runId },
    }));
  }, []);

  const clearStepExecution = useCallback((stepId: string) => {
    setStepExecutions((prev) => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  }, []);

  const resetTransformState = useCallback(() => {
    setFinalResultState(null);
    setFinalErrorState(null);
    setTransformStatusState("idle");
  }, []);

  const clearExecutionsFrom = useCallback(
    (stepIndex: number) => {
      const stepIdsToRemove = steps.slice(stepIndex).map((s) => s.id);
      setStepExecutions((prev) => {
        const next = { ...prev };
        for (const id of stepIdsToRemove) delete next[id];
        return next;
      });
      resetTransformState();
    },
    [steps, resetTransformState],
  );

  const clearAllExecutions = useCallback(() => {
    setStepExecutions({});
    resetTransformState();
  }, [resetTransformState]);

  const prevStepHashesRef = useRef<string[]>([]);
  const skipNextHashInvalidationRef = useRef(false);

  const skipNextHashInvalidation = useCallback(() => {
    skipNextHashInvalidationRef.current = true;
  }, []);

  const hashStepConfig = (s: ExecutionStep): string => {
    try {
      return JSON.stringify({
        id: s.id,
        executionMode: s.executionMode,
        loopSelector: s.loopSelector,
        integrationId: s.integrationId,
        apiConfig: s.apiConfig,
        modify: s.modify,
        failureBehavior: s.failureBehavior,
      });
    } catch {
      return "";
    }
  };

  useEffect(() => {
    const currentHashes = steps.map(hashStepConfig);
    const prevHashes = prevStepHashesRef.current;

    if (skipNextHashInvalidationRef.current) {
      skipNextHashInvalidationRef.current = false;
      prevStepHashesRef.current = currentHashes;
      return;
    }

    if (prevHashes.length > 0) {
      for (let i = 0; i < Math.min(currentHashes.length, prevHashes.length); i++) {
        if (currentHashes[i] !== prevHashes[i]) {
          const stepIdsToRemove = steps.slice(i).map((s) => s.id);
          setStepExecutions((prev) => {
            const hasExecutionsToRemove = stepIdsToRemove.some((id) => prev[id]);
            if (!hasExecutionsToRemove) return prev;
            const next = { ...prev };
            for (const id of stepIdsToRemove) delete next[id];
            return next;
          });
          resetTransformState();
          break;
        }
      }
    }

    prevStepHashesRef.current = currentHashes;
  }, [steps, resetTransformState]);

  const startExecution = useCallback((runId: string) => {
    setCurrentRunId(runId);
    setIsExecutingAny(true);
    setIsStopping(false);
  }, []);

  const stopExecution = useCallback(() => {
    setIsStopping(true);
    setCurrentRunId(null);
    setIsExecutingAny(false);
    setCurrentExecutingStepIndexState(null);
  }, []);

  const markAsStopping = useCallback(() => {
    setIsStopping(true);
    setCurrentRunId(null);
  }, []);

  const finishExecution = useCallback(() => {
    setCurrentRunId(null);
    setIsExecutingAny(false);
    setIsStopping(false);
    setCurrentExecutingStepIndexState(null);
  }, []);

  const setCurrentExecutingStepIndex = useCallback((index: number | null) => {
    setCurrentExecutingStepIndexState(index);
  }, []);

  const setFinalResult = useCallback((result: any, status: TransformStatus, error?: string) => {
    setFinalResultState(result);
    setFinalErrorState(error ?? null);
    setTransformStatusState(status);
  }, []);

  const setTransformRunning = useCallback((_runId: string) => {
    setTransformStatusState("running");
  }, []);

  const setTransformStatus = useCallback((status: TransformStatus) => {
    setTransformStatusState(status);
  }, []);

  const clearFinalResult = useCallback(() => {
    setFinalResultState(null);
    setFinalErrorState(null);
    setTransformStatusState("idle");
  }, []);

  const getStepExecution = useCallback(
    (stepId: string): StepExecutionState => {
      return stepExecutions[stepId] ?? DEFAULT_STEP_EXECUTION;
    },
    [stepExecutions],
  );

  const getStepStatus = useCallback(
    (stepId: string): StepStatus => {
      return stepExecutions[stepId]?.status ?? "pending";
    },
    [stepExecutions],
  );

  const getStepResult = useCallback(
    (stepId: string): any | null => {
      return stepExecutions[stepId]?.result ?? null;
    },
    [stepExecutions],
  );

  const isStepCompleted = useCallback(
    (stepId: string): boolean => {
      return stepExecutions[stepId]?.status === "completed";
    },
    [stepExecutions],
  );

  const isStepFailed = useCallback(
    (stepId: string): boolean => {
      return stepExecutions[stepId]?.status === "failed";
    },
    [stepExecutions],
  );

  const isStepAborted = useCallback(
    (stepId: string): boolean => {
      return stepExecutions[stepId]?.status === "aborted";
    },
    [stepExecutions],
  );

  const isStepRunning = useCallback(
    (stepId: string): boolean => {
      return stepExecutions[stepId]?.status === "running";
    },
    [stepExecutions],
  );

  const getStepStatusInfo = useCallback(
    (stepId: string): StepStatusInfo => {
      if (stepId === "__final_transform__") {
        if (transformStatus === "fixing") return STATUS_INFO.fixing;
        if (transformStatus === "running") return STATUS_INFO.running;
        if (transformStatus === "completed") return STATUS_INFO.completed;
        if (transformStatus === "failed") return STATUS_INFO.failed;
        return STATUS_INFO.pending;
      }

      const status = stepExecutions[stepId]?.status;
      if (status === "running") return STATUS_INFO.running;
      if (status === "completed") return STATUS_INFO.completed;
      if (status === "failed") return STATUS_INFO.failed;
      return STATUS_INFO.pending;
    },
    [stepExecutions, transformStatus],
  );

  const canExecuteStep = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex === 0) return true;
      for (let i = 0; i < stepIndex; i++) {
        const stepId = steps[i]?.id;
        if (!stepId) return false;
        if (stepExecutions[stepId]?.status !== "completed") return false;
      }
      return true;
    },
    [steps, stepExecutions],
  );

  const isRunningTransform = transformStatus === "running";
  const isFixingTransform = transformStatus === "fixing";
  const isExecutingTransform = isRunningTransform || isFixingTransform;

  const canExecuteTransform = useMemo(
    () => steps.length > 0 && steps.every((s) => stepExecutions[s.id]?.status === "completed"),
    [steps, stepExecutions],
  );

  const stepResultsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const [stepId, exec] of Object.entries(stepExecutions)) {
      if (exec.result !== null) map[stepId] = exec.result;
    }
    return map;
  }, [stepExecutions]);

  const stepInputs = useMemo(() => {
    const payloads: Record<string, any> = {};
    for (let i = 0; i < steps.length; i++) {
      const stepId = steps[i].id;
      payloads[stepId] = buildStepInput(payload.computedPayload, steps, stepResultsMap, i - 1);
    }
    return payloads;
  }, [steps, payload.computedPayload, stepResultsMap]);

  // stepInputVersion tracks changes to step inputs (payload + previous step results)
  // Used by data selector effect to know when to re-evaluate
  const stepInputVersionRef = useRef({
    version: 0,
    payloadRef: null as any,
    resultsRef: null as any,
    stepsLen: 0,
  });

  if (
    stepInputVersionRef.current.payloadRef !== payload.computedPayload ||
    stepInputVersionRef.current.resultsRef !== stepResultsMap ||
    stepInputVersionRef.current.stepsLen !== steps.length
  ) {
    stepInputVersionRef.current = {
      version: stepInputVersionRef.current.version + 1,
      payloadRef: payload.computedPayload,
      resultsRef: stepResultsMap,
      stepsLen: steps.length,
    };
  }

  const stepInputVersion = stepInputVersionRef.current.version;
  // Incremented when setDataSelectorResults is called with new data
  const dataSelectorVersionRef = useRef(0);
  // Combined version for template cache - invalidates when EITHER step inputs OR data selector output changes
  const sourceDataVersion = stepInputVersion * 10000 + dataSelectorVersionRef.current;

  const getStepInput = useCallback(
    (stepId?: string): Record<string, any> => {
      if (!stepId) {
        if (steps.length === 0) return payload.computedPayload;
        const lastStepId = steps[steps.length - 1].id;
        return stepInputs[lastStepId] ?? payload.computedPayload;
      }
      return stepInputs[stepId] ?? payload.computedPayload;
    },
    [steps, stepInputs, payload.computedPayload],
  );

  const manualPayload = useMemo(() => {
    try {
      return JSON.parse(payload.manualPayloadText || "{}");
    } catch {
      return {};
    }
  }, [payload.manualPayloadText]);

  useEffect(() => {
    for (const step of steps) {
      const stepId = step.id;
      const stepInput = stepInputs[stepId];
      const loopSelector = step.loopSelector ?? "";

      const cached = dataSelectorCacheRef.current.get(stepId);
      if (cached && cached.version === stepInputVersion && cached.loopSelector === loopSelector) {
        if (
          dataSelectorResults[stepId]?.output !== cached.result.output ||
          dataSelectorResults[stepId]?.error !== cached.result.error
        ) {
          setDataSelectorResults((prev) => ({ ...prev, [stepId]: cached.result }));
        }
        continue;
      }

      if (dataSelectorTimersRef.current[stepId]) {
        window.clearTimeout(dataSelectorTimersRef.current[stepId]);
      }

      dataSelectorTimersRef.current[stepId] = window.setTimeout(() => {
        let result: DataSelectorResult;
        try {
          assertValidArrowFunction(loopSelector || undefined);
          const output = executeWithVMHelpers(
            loopSelector || "(sourceData) => sourceData",
            stepInput || {},
          );
          if (typeof output === "function") {
            throw new Error("Data selector returned a function. Did you forget to call it?");
          }
          result = { output: output === undefined ? null : output, error: null };
        } catch (err: any) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          result = { output: null, error: errorMessage };
        }

        dataSelectorCacheRef.current.set(stepId, {
          version: stepInputVersion,
          loopSelector,
          result,
        });
        dataSelectorVersionRef.current += 1;
        setDataSelectorResults((prev) => ({ ...prev, [stepId]: result }));
      }, DATA_SELECTOR_DEBOUNCE_MS) as unknown as number;
    }

    return () => {
      for (const timer of Object.values(dataSelectorTimersRef.current)) {
        window.clearTimeout(timer);
      }
    };
  }, [steps, stepInputVersion]);

  const stepTemplateDataMap = useMemo(() => {
    const map: Record<string, StepTemplateData> = {};

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = step.id;
      const stepIndex = i;

      const canExec =
        stepIndex === 0 ||
        steps.slice(0, stepIndex).every((s) => stepExecutions[s.id]?.status === "completed");

      const stepInput = stepInputs[stepId] || {};
      const dsResult = dataSelectorResults[stepId] || { output: null, error: null };
      const currentItemObj = deriveCurrentItem(dsResult.output);

      const linkedIntegration =
        step.integrationId && integrations
          ? integrations.find((int) => int.id === step.integrationId)
          : undefined;

      const integrationCredentials = flattenAndNamespaceCredentials(
        linkedIntegration ? [linkedIntegration] : [],
      );
      const paginationData = buildPaginationData(step.apiConfig?.pagination);

      const sourceData: Record<string, any> = {
        ...integrationCredentials,
        ...stepInput,
        ...(currentItemObj != null ? { currentItem: currentItemObj } : {}),
        ...paginationData,
      };

      const allIntegrationCredentials = flattenAndNamespaceCredentials(integrations);
      const credentials = {
        ...extractCredentials(sourceData),
        ...allIntegrationCredentials,
      };

      const previousStepResults = buildPreviousStepResults(steps, stepResultsMap, stepIndex - 1);

      const categorizedSources: CategorizedSources = {
        manualPayload,
        filePayloads: payload.filePayloads || {},
        previousStepResults,
        currentItem: currentItemObj,
        paginationData,
      };

      const categorizedVariables: CategorizedVariables = {
        credentials: Object.keys(integrationCredentials),
        toolInputs: Object.keys(manualPayload),
        fileInputs: Object.keys(payload.filePayloads || {}),
        currentStepData: ["currentItem"],
        previousStepData: Object.keys(previousStepResults),
        paginationVariables: ["page", "offset", "cursor", "limit", "pageSize"],
      };

      map[stepId] = {
        sourceData,
        credentials,
        categorizedVariables,
        categorizedSources,
        dataSelectorOutput: dsResult.output,
        dataSelectorError: dsResult.error,
        canExecute: canExec,
      };
    }

    return map;
  }, [
    steps,
    stepExecutions,
    stepInputs,
    dataSelectorResults,
    integrations,
    manualPayload,
    payload.filePayloads,
    stepResultsMap,
  ]);

  const getStepTemplateData = useCallback(
    (stepId: string): StepTemplateData => {
      return stepTemplateDataMap[stepId] || emptyStepTemplateData;
    },
    [stepTemplateDataMap],
  );

  const getSourceData = useCallback(
    (stepId: string): Record<string, any> => {
      return stepTemplateDataMap[stepId]?.sourceData || {};
    },
    [stepTemplateDataMap],
  );

  const getCredentials = useCallback(
    (stepId: string): Record<string, string> => {
      return stepTemplateDataMap[stepId]?.credentials || {};
    },
    [stepTemplateDataMap],
  );

  const getCategorizedVariables = useCallback(
    (stepId: string): CategorizedVariables => {
      return stepTemplateDataMap[stepId]?.categorizedVariables || emptyCategorizedVariables;
    },
    [stepTemplateDataMap],
  );

  const getCategorizedSources = useCallback(
    (stepId: string): CategorizedSources => {
      return stepTemplateDataMap[stepId]?.categorizedSources || emptyCategorizedSources;
    },
    [stepTemplateDataMap],
  );

  const getDataSelectorResult = useCallback(
    (stepId: string): DataSelectorResult => {
      return dataSelectorResults[stepId] || { output: null, error: null };
    },
    [dataSelectorResults],
  );

  const getExecutionStateSummary = useCallback((): string => {
    const lines: string[] = [];

    if (isExecutingAny) {
      lines.push(
        `Execution Status: Running (step ${(currentExecutingStepIndex ?? 0) + 1}/${steps.length})`,
      );
    } else if (isStopping) {
      lines.push("Execution Status: Stopping");
    } else {
      lines.push("Execution Status: Idle");
    }

    // Per-step status summary
    const stepSummaries: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const exec = stepExecutions[step.id];
      const status = exec?.status ?? "pending";
      const dsResult = dataSelectorResults[step.id];

      let summary = `Step ${i + 1} (${step.id}): ${status}`;

      if (status === "failed" && exec?.error) {
        summary += ` - Error: ${exec.error.substring(0, 400)}`;
      }

      if (
        dsResult?.error &&
        (status === "completed" || status === "failed" || status === "running")
      ) {
        summary += ` - DataSelector Error: ${dsResult.error.substring(0, 400)}`;
      }

      stepSummaries.push(summary);
    }

    if (stepSummaries.length > 0) {
      lines.push("\nStep Status:");
      lines.push(...stepSummaries);
    }

    if (transformStatus !== "idle") {
      lines.push(`\nFinal Transform: ${transformStatus}`);
      if (finalError) {
        lines.push(`Transform Error: ${finalError.substring(0, 200)}`);
      }
    }

    return lines.join("\n");
  }, [
    isExecutingAny,
    isStopping,
    currentExecutingStepIndex,
    steps,
    stepExecutions,
    dataSelectorResults,
    transformStatus,
    finalError,
  ]);

  const value = useMemo<ExecutionContextValue>(
    () => ({
      stepExecutions,
      isExecutingAny,
      currentExecutingStepIndex,
      currentRunId,
      isStopping,
      finalResult,
      finalError,
      transformStatus,
      isRunningTransform,
      isFixingTransform,
      isExecutingTransform,
      canExecuteTransform,
      setStepResult,
      setStepRunning,
      clearStepExecution,
      clearExecutionsFrom,
      clearAllExecutions,
      startExecution,
      stopExecution,
      markAsStopping,
      finishExecution,
      setCurrentExecutingStepIndex,
      skipNextHashInvalidation,
      setFinalResult,
      setTransformRunning,
      setTransformStatus,
      clearFinalResult,
      getStepExecution,
      getStepStatus,
      getStepResult,
      getStepStatusInfo,
      isStepCompleted,
      isStepFailed,
      isStepAborted,
      isStepRunning,
      canExecuteStep,
      getStepInput,
      stepResultsMap,
      sourceDataVersion,
      getStepTemplateData,
      getSourceData,
      getCredentials,
      getCategorizedVariables,
      getCategorizedSources,
      getDataSelectorResult,
      getExecutionStateSummary,
    }),
    [
      stepExecutions,
      isExecutingAny,
      currentExecutingStepIndex,
      currentRunId,
      isStopping,
      finalResult,
      finalError,
      transformStatus,
      isRunningTransform,
      isFixingTransform,
      isExecutingTransform,
      canExecuteTransform,
      setStepResult,
      setStepRunning,
      clearStepExecution,
      clearExecutionsFrom,
      clearAllExecutions,
      startExecution,
      stopExecution,
      markAsStopping,
      finishExecution,
      setCurrentExecutingStepIndex,
      skipNextHashInvalidation,
      setFinalResult,
      setTransformRunning,
      setTransformStatus,
      clearFinalResult,
      getStepExecution,
      getStepStatus,
      getStepResult,
      getStepStatusInfo,
      isStepCompleted,
      isStepFailed,
      isStepAborted,
      isStepRunning,
      canExecuteStep,
      getStepInput,
      stepResultsMap,
      sourceDataVersion,
      getStepTemplateData,
      getSourceData,
      getCredentials,
      getCategorizedVariables,
      getCategorizedSources,
      getDataSelectorResult,
      getExecutionStateSummary,
    ],
  );

  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}
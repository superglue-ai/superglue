import { useEnvironment } from "@/src/app/environment-context";
import { useToast } from "@/src/hooks/use-toast";
import {
  abortExecution,
  executeOutputTransform,
  executeSingleStep,
  executeToolStepByStep,
  generateUUID,
  shouldDebounceAbort,
  type StepExecutionResult,
} from "@/src/lib/client-utils";
import { useSuperglueClient } from "@/src/queries/use-client";
import {
  computeStepOutput,
  isAbortError,
  wrapDataSelectorWithLimit,
} from "@/src/lib/general-utils";
import { isRequestConfig, isTransformConfig, Tool, ToolResult } from "@superglue/shared";
import { useMemo, useRef } from "react";
import { useExecution, useToolConfig } from "../context";
import type { StepStatus, TransformStatus } from "../context/types";

interface UseToolExecutionOptions {
  onExecute?: (tool: Tool, result: ToolResult) => void;
  onStopExecution?: () => void;
  embedded?: boolean;
}

interface ExecuteStepOptions {
  limitIterations?: number;
  updatedInstruction?: string;
}

interface NavigationCallbacks {
  setFocusStepId: (id: string | null) => void;
  setShowStepOutputSignal: (signal: number) => void;
  setNavigateToFinalSignal: (signal: number) => void;
}

export function useToolExecution(
  options: UseToolExecutionOptions,
  navigationCallbacks: NavigationCallbacks,
) {
  const { onExecute, onStopExecution, embedded } = options;
  const { setFocusStepId, setShowStepOutputSignal, setNavigateToFinalSignal } = navigationCallbacks;

  const createClient = useSuperglueClient();
  const { mode: environmentMode } = useEnvironment();
  const { toast } = useToast();
  const { tool, steps, payload, setSteps, setOutputTransform, responseFilters, systems } =
    useToolConfig();
  const toolId = tool.id;
  const outputTransform = tool.outputTransform || "";
  const outputSchema = tool.outputSchema ? JSON.stringify(tool.outputSchema) : "";
  const inputSchema = tool.inputSchema ? JSON.stringify(tool.inputSchema) : "";
  const instructions = tool.instruction;
  const computedPayload = payload.computedPayload;
  const executionFiles = payload.filePayloads;

  // Extract system IDs from request steps. For transform-only tools or output transforms
  // that need credentials, fall back to systems explicitly associated with this tool context.
  const systemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const step of steps) {
      if (step.config && isRequestConfig(step.config) && step.config.systemId) {
        ids.add(step.config.systemId);
      }
    }
    // If no request steps reference systems but systems are configured in the tool context,
    // include them for transform/output transform credential access
    if (ids.size === 0 && systems.length > 0) {
      for (const sys of systems) {
        ids.add(sys.id);
      }
    }
    return Array.from(ids);
  }, [steps, systems]);

  const {
    setStepResult,
    clearAllExecutions,
    startExecution,
    markAsStopping,
    finishExecution,
    setCurrentExecutingStepIndex,
    setFinalResult,
    setTransformStatus,
    stepResultsMap,
    skipNextHashInvalidation,
  } = useExecution();

  const currentRunIdRef = useRef<string | null>(null);
  const executionCompletedRef = useRef(false);
  const shouldAbortRef = useRef(false);
  const lastAbortTimeRef = useRef<number>(0);

  const handleStopExecution = async () => {
    if (shouldDebounceAbort(lastAbortTimeRef.current)) return;

    lastAbortTimeRef.current = Date.now();
    shouldAbortRef.current = true;

    const runIdToAbort = currentRunIdRef.current;
    if (runIdToAbort) {
      markAsStopping();
      const client = createClient();
      await abortExecution(client, runIdToAbort);
    }

    if (embedded && onStopExecution) {
      onStopExecution();
    }
  };

  const executeWithRunId = async <T>(
    executor: (runId: string) => Promise<T>,
    executionOptions?: { stepIndex?: number; onComplete?: (result: T) => void },
  ): Promise<T | undefined> => {
    const runId = generateUUID();
    executionCompletedRef.current = false;
    currentRunIdRef.current = runId;
    startExecution(runId);

    if (executionOptions?.stepIndex !== undefined) {
      setCurrentExecutingStepIndex(executionOptions.stepIndex);
    }

    try {
      const result = await executor(runId);
      executionOptions?.onComplete?.(result);
      return result;
    } finally {
      executionCompletedRef.current = true;
      currentRunIdRef.current = null;
      finishExecution();
    }
  };

  const executeStepByIdx = async (idx: number, stepOptions?: ExecuteStepOptions) => {
    const { limitIterations, updatedInstruction } = stepOptions || {};

    return executeWithRunId(
      async () => {
        const client = createClient();

        const originalDataSelector = steps[idx]?.dataSelector;
        let stepToExecute = steps[idx];

        if (updatedInstruction) {
          stepToExecute = {
            ...stepToExecute,
            instruction: updatedInstruction,
          };
        }

        if (limitIterations && originalDataSelector) {
          stepToExecute = {
            ...stepToExecute,
            dataSelector: wrapDataSelectorWithLimit(originalDataSelector, limitIterations),
          };
        }

        const currentStepResultsMap = stepResultsMap;
        // Pass systemIds for transform steps so they can access system credentials
        const stepSystemIds = isTransformConfig(stepToExecute.config) ? systemIds : undefined;
        const single = await executeSingleStep({
          client,
          step: stepToExecute,
          payload: computedPayload,
          files: executionFiles,
          previousResults: currentStepResultsMap,
          onRunIdGenerated: (singleRunId) => {
            currentRunIdRef.current = singleRunId;
          },
          mode: environmentMode,
          systemIds: stepSystemIds,
        });

        const sid = steps[idx].id;
        const normalized = computeStepOutput(single);
        const isFailure = !single.success;

        if (single.updatedStep) {
          const updatedStep =
            limitIterations && originalDataSelector
              ? { ...single.updatedStep, dataSelector: originalDataSelector }
              : single.updatedStep;
          skipNextHashInvalidation();
          setSteps(steps.map((step, i) => (i === idx ? updatedStep : step)));
        }

        if (isFailure) {
          const status: StepStatus = isAbortError(single.error) ? "aborted" : "failed";
          setStepResult(sid, normalized.output, status, single.error || undefined);
        } else {
          setStepResult(sid, normalized.output, "completed");
        }

        setFocusStepId(sid);
        setShowStepOutputSignal(Date.now());
        return single;
      },
      { stepIndex: idx },
    );
  };

  const executeTransform = async (schemaStr: string, transformStr: string): Promise<void> => {
    await executeWithRunId(async () => {
      setTransformStatus("running");

      const currentStepResultsMap = stepResultsMap;
      const stepData: Record<string, any> = {};
      Object.entries(currentStepResultsMap).forEach(([stepId, result]) => {
        if (stepId !== "__final_transform__") {
          stepData[stepId] = result;
        }
      });

      const parsedSchema = schemaStr && schemaStr.trim() ? JSON.parse(schemaStr) : null;
      const client = createClient();
      const result = await executeOutputTransform({
        client,
        outputTransform: transformStr || outputTransform,
        outputSchema: parsedSchema,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        payload: computedPayload,
        files: executionFiles,
        previousResults: stepData,
        onRunIdGenerated: (transformRunId) => {
          currentRunIdRef.current = transformRunId;
        },
        responseFilters,
      });

      if (result.success) {
        setFinalResult(result.data, "completed");
        setNavigateToFinalSignal(Date.now());

        if (
          result.updatedTransform &&
          result.updatedTransform !== (transformStr || outputTransform)
        ) {
          setOutputTransform(result.updatedTransform);
        }
      } else {
        const status: TransformStatus = isAbortError(result.error) ? "aborted" : "failed";
        const message = result.error || `Transform execution ${status}`;
        setFinalResult(message, status, result.error || undefined);
      }

      return result;
    });
  };

  const executeTool = async (
    setLoading: (loading: boolean) => void,
    handleBeforeStepExecution: (stepIndex: number, step: any) => Promise<boolean>,
  ) => {
    const runId = generateUUID();
    executionCompletedRef.current = false;
    shouldAbortRef.current = false;
    currentRunIdRef.current = runId;
    startExecution(runId);
    setLoading(true);
    clearAllExecutions();
    setFocusStepId(null);

    let finalToolConfig: Tool | null = null;
    let wr: ToolResult | null = null;

    try {
      JSON.parse(outputSchema || "{}");
      JSON.parse(inputSchema || "{}");

      const executionSteps = steps;
      const currentOutputSchema =
        outputSchema && outputSchema.trim() ? JSON.parse(outputSchema) : null;

      const executionTool = {
        id: toolId,
        steps: executionSteps,
        outputTransform,
        outputSchema: currentOutputSchema,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        responseFilters,
      } as any;

      const originalStepsJson = JSON.stringify(executionSteps);

      setCurrentExecutingStepIndex(0);

      const client = createClient();
      const state = await executeToolStepByStep({
        client,
        tool: executionTool,
        payload: computedPayload,
        files: executionFiles,
        onStepComplete: (i: number, res: StepExecutionResult) => {
          if (i < executionTool.steps.length - 1) {
            setCurrentExecutingStepIndex(i + 1);
          } else {
            setCurrentExecutingStepIndex(executionTool.steps.length);
          }

          try {
            const normalized = computeStepOutput(res);
            if (res.success) {
              setStepResult(res.stepId, normalized.output, "completed");
            } else if (isAbortError(res.error)) {
              setStepResult(res.stepId, normalized.output, "aborted", res.error || undefined);
              setFocusStepId(res.stepId);
              setShowStepOutputSignal(Date.now());
            } else {
              setStepResult(res.stepId, normalized.output, "failed", res.error || undefined);
              setFocusStepId(res.stepId);
              setShowStepOutputSignal(Date.now());
            }
          } catch {
            // Ignore individual step processing errors to not halt the overall execution
          }
        },
        onBeforeStep: handleBeforeStepExecution,
        onStepRunIdChange: (stepRunId: string) => {
          currentRunIdRef.current = stepRunId;
        },
        mode: environmentMode,
        systemIds,
      });

      if (state.currentTool.steps) {
        const returnedStepsJson = JSON.stringify(state.currentTool.steps);
        if (originalStepsJson !== returnedStepsJson) {
          skipNextHashInvalidation();
          setSteps(state.currentTool.steps);
        }
      }

      if (state.stepResults["__final_transform__"]) {
        const normalized = computeStepOutput(
          state.stepResults["__final_transform__"] as StepExecutionResult,
        );
        const transformRes = state.stepResults["__final_transform__"];
        if (transformRes.success) {
          setFinalResult(normalized.output, "completed");
        } else if (isAbortError(transformRes.error)) {
          setFinalResult(normalized.output, "aborted", transformRes.error || undefined);
        } else {
          setFinalResult(normalized.output, "failed", transformRes.error || undefined);
        }
      }

      const finalData = state.stepResults["__final_transform__"]?.data;

      wr = {
        success: state.failedSteps.length === 0,
        data: finalData,
        error: state.stepResults["__final_transform__"]?.error,
        stepResults: Object.entries(state.stepResults)
          .filter(([key]) => key !== "__final_transform__")
          .map(([stepId, result]: [string, StepExecutionResult]) => ({
            stepId,
            success: result.success,
            data: result.data,
            error: result.error,
            stepFileKeys: result.stepFileKeys,
          })),
        tool: {
          id: toolId,
          steps: state.currentTool.steps,
          outputTransform: state.currentTool.outputTransform || outputTransform,
        } as any,
      };

      if (
        state.currentTool.outputTransform &&
        state.currentTool.outputTransform !== outputTransform
      ) {
        setOutputTransform(state.currentTool.outputTransform);
      }

      if (state.failedSteps.length === 0 && state.abortedSteps.length === 0 && !state.interrupted) {
        setNavigateToFinalSignal(Date.now());
      } else {
        const firstProblematicStep = state.failedSteps[0] || state.abortedSteps[0];
        if (firstProblematicStep) {
          if (firstProblematicStep === "__final_transform__") {
            setNavigateToFinalSignal(Date.now());
          } else {
            setFocusStepId(firstProblematicStep);
            setShowStepOutputSignal(Date.now());
          }
        } else if (state.interrupted) {
          const lastExecutedStepId = state.completedSteps[state.completedSteps.length - 1];
          if (lastExecutedStepId) {
            setFocusStepId(lastExecutedStepId);
            setShowStepOutputSignal(Date.now());
          }
        }
      }

      // Set the final tool config for run creation
      finalToolConfig = {
        id: toolId,
        steps: state.currentTool.steps,
        outputTransform: state.currentTool.outputTransform || outputTransform,
        outputSchema: currentOutputSchema,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        instruction: instructions,
      } as Tool;

      if (onExecute) {
        onExecute(finalToolConfig, wr);
      }
    } catch (error: any) {
      console.error("Error executing tool:", error);
      toast({
        title: "Error executing tool",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      executionCompletedRef.current = true;
      currentRunIdRef.current = null;
      setLoading(false);
      finishExecution();
    }
  };

  return {
    executeTool,
    executeStepByIdx,
    executeTransform,
    handleStopExecution,
    currentRunIdRef,
    shouldAbortRef,
    executionCompletedRef,
  };
}

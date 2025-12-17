import { useRef } from 'react';
import { useConfig } from '@/src/app/config-context';
import { useToast } from '@/src/hooks/use-toast';
import { 
  abortExecution, 
  createSuperglueClient, 
  executeFinalTransform, 
  executeSingleStep, 
  executeToolStepByStep, 
  generateUUID, 
  shouldDebounceAbort, 
  type StepExecutionResult 
} from '@/src/lib/client-utils';
import { computeStepOutput, isAbortError, wrapLoopSelectorWithLimit } from '@/src/lib/general-utils';
import { ExecutionStep, Tool, ToolResult } from '@superglue/shared';
import { useExecution, useToolConfig } from '../context';
import type { StepStatus, TransformStatus } from '../context/types';

interface UseToolExecutionOptions {
  onExecute?: (tool: Tool, result: ToolResult) => void;
  onStopExecution?: () => void;
  embedded?: boolean;
}

interface ExecuteStepOptions {
  limitIterations?: number;
  selfHealing?: boolean;
  updatedInstruction?: string;
}

interface NavigationCallbacks {
  setFocusStepId: (id: string | null) => void;
  setShowStepOutputSignal: (signal: number) => void;
  setNavigateToFinalSignal: (signal: number) => void;
}

export function useToolExecution(
  options: UseToolExecutionOptions,
  navigationCallbacks: NavigationCallbacks
) {
  const { onExecute, onStopExecution, embedded } = options;
  const { setFocusStepId, setShowStepOutputSignal, setNavigateToFinalSignal } = navigationCallbacks;
  
  const config = useConfig();
  const { toast } = useToast();
  const { tool, steps, payload, setSteps, setFinalTransform } = useToolConfig();
  const toolId = tool.id;
  const finalTransform = tool.finalTransform || '';
  const responseSchema = tool.responseSchema ? JSON.stringify(tool.responseSchema) : '';
  const inputSchema = tool.inputSchema ? JSON.stringify(tool.inputSchema) : '';
  const instructions = tool.instruction;
  const computedPayload = payload.computedPayload;
  
  const {
    setStepResult,
    clearAllExecutions,
    startExecution,
    markAsStopping,
    finishExecution,
    setCurrentExecutingStepIndex,
    setFinalResult,
    setTransformStatus,
    getStepResultsMap,
  } = useExecution();

  const currentRunIdRef = useRef<string | null>(null);
  const executionCompletedRef = useRef(false);
  const shouldAbortRef = useRef(false);
  const lastAbortTimeRef = useRef<number>(0);

  const handleStopExecution = async () => {
    if (shouldDebounceAbort(lastAbortTimeRef.current)) return;
    if (!currentRunIdRef.current || executionCompletedRef.current) return;
    
    lastAbortTimeRef.current = Date.now();
    shouldAbortRef.current = true;
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!currentRunIdRef.current || executionCompletedRef.current) return;
    
    const client = createSuperglueClient(config.superglueEndpoint);
    const success = await abortExecution(client, currentRunIdRef.current);
    
    if (executionCompletedRef.current) return;
    
    if (success) {
      markAsStopping();
      currentRunIdRef.current = null;
      toast({
        title: "Execution aborted",
        description: "Tool execution has been aborted",
      });
    }
    
    if (embedded && onStopExecution) {
      onStopExecution();
    }
  };

  const executeWithRunId = async <T,>(
    executor: (runId: string) => Promise<T>,
    executionOptions?: { stepIndex?: number; onComplete?: (result: T) => void }
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

  const executeStepByIdx = async (
    idx: number, 
    stepOptions?: ExecuteStepOptions
  ) => {
    const { limitIterations, selfHealing = false, updatedInstruction } = stepOptions || {};
    
    return executeWithRunId(async () => {
      const client = createSuperglueClient(config.superglueEndpoint);
      
      const originalLoopSelector = steps[idx]?.loopSelector;
      let stepToExecute = steps[idx];
      
      if (updatedInstruction) {
        stepToExecute = { 
          ...stepToExecute, 
          apiConfig: { ...stepToExecute.apiConfig, instruction: updatedInstruction } 
        };
      }
      
      if (limitIterations && originalLoopSelector) {
        stepToExecute = { 
          ...stepToExecute, 
          loopSelector: wrapLoopSelectorWithLimit(originalLoopSelector, limitIterations) 
        };
      }

      const currentStepResultsMap = getStepResultsMap();
      const single = await executeSingleStep({
        client,
        step: stepToExecute,
        toolId,
        payload: computedPayload,
        previousResults: currentStepResultsMap,
        selfHealing,
        onRunIdGenerated: (singleRunId) => { currentRunIdRef.current = singleRunId; }
      });
      
      const sid = steps[idx].id;
      const normalized = computeStepOutput(single);
      const isFailure = !single.success;

      if (single.updatedStep) {
        const updatedStep = limitIterations && originalLoopSelector
          ? { ...single.updatedStep, loopSelector: originalLoopSelector }
          : single.updatedStep;
        setSteps(steps.map((step, i) => i === idx ? updatedStep : step));
        
        if (selfHealing && single.success) {
          toast({
            title: "Step fixed",
            description: "The step configuration has been updated and executed successfully.",
          });
        }
      }

      if (isFailure) {
        const status: StepStatus = isAbortError(single.error) ? 'aborted' : 'failed';
        setStepResult(sid, normalized.output, status, single.error || undefined);
        if (selfHealing) {
          throw new Error(single.error || 'Failed to fix step');
        }
      } else {
        setStepResult(sid, normalized.output, 'completed');
      }
      
      setFocusStepId(sid);
      setShowStepOutputSignal(Date.now());
      return single;
    }, { stepIndex: idx });
  };

  const executeTransform = async (
    schemaStr: string, 
    transformStr: string, 
    selfHealing: boolean = false
  ): Promise<void> => {
    await executeWithRunId(async () => {
      setTransformStatus(selfHealing ? 'fixing' : 'running');

      const currentStepResultsMap = getStepResultsMap();
      const stepData: Record<string, any> = {};
      Object.entries(currentStepResultsMap).forEach(([stepId, result]) => {
        if (stepId !== '__final_transform__') {
          stepData[stepId] = result;
        }
      });
      
      const parsedSchema = schemaStr && schemaStr.trim() ? JSON.parse(schemaStr) : null;
      const client = createSuperglueClient(config.superglueEndpoint);
      const result = await executeFinalTransform(
        client,
        toolId || 'test',
        transformStr || finalTransform,
        parsedSchema,
        inputSchema ? JSON.parse(inputSchema) : null,
        computedPayload,
        stepData,
        selfHealing,
        (transformRunId) => { currentRunIdRef.current = transformRunId; }
      );

      if (result.success) {
        setFinalResult(result.data, 'completed');
        setNavigateToFinalSignal(Date.now());

        if (result.updatedTransform && result.updatedTransform !== (transformStr || finalTransform)) {
          setFinalTransform(result.updatedTransform);
          if (selfHealing) {
            toast({
              title: "Transform code updated",
              description: "auto-repair has modified the transform code to fix issues.",
            });
          }
        }
      } else {
        const status: TransformStatus = isAbortError(result.error) ? 'aborted' : 'failed';
        const message = result.error || `Transform execution ${status}`;
        setFinalResult(message, status, result.error || undefined);
      }
      
      return result;
    });
  };

  const executeTool = async (
    setLoading: (loading: boolean) => void,
    handleBeforeStepExecution: (stepIndex: number, step: any) => Promise<boolean>
  ) => {
    const runId = generateUUID();
    executionCompletedRef.current = false;
    shouldAbortRef.current = false;
    currentRunIdRef.current = runId;
    startExecution(runId);
    setLoading(true);
    clearAllExecutions();
    setFocusStepId(null);

    try {
      JSON.parse(responseSchema || '{}');
      JSON.parse(inputSchema || '{}');

      const executionSteps = steps;
      const currentResponseSchema = responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null;
      const effectiveSelfHealing = false;

      const executionTool = {
        id: toolId,
        steps: executionSteps,
        finalTransform,
        responseSchema: currentResponseSchema,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
      } as any;

      const originalStepsJson = JSON.stringify(executionSteps);

      setCurrentExecutingStepIndex(0);

      const client = createSuperglueClient(config.superglueEndpoint);
      const state = await executeToolStepByStep(
        client,
        executionTool,
        computedPayload,
        (i: number, res: StepExecutionResult) => {
          if (i < executionTool.steps.length - 1) {
            setCurrentExecutingStepIndex(i + 1);
          } else {
            setCurrentExecutingStepIndex(executionTool.steps.length);
          }

          try {
            const normalized = computeStepOutput(res);
            if (res.success) {
              setStepResult(res.stepId, normalized.output, 'completed');
            } else if (isAbortError(res.error)) {
              setStepResult(res.stepId, normalized.output, 'aborted', res.error || undefined);
              setFocusStepId(res.stepId);
              setShowStepOutputSignal(Date.now());
            } else {
              setStepResult(res.stepId, normalized.output, 'failed', res.error || undefined);
              setFocusStepId(res.stepId);
              setShowStepOutputSignal(Date.now());
            }
          } catch { }
        },
        effectiveSelfHealing,
        handleBeforeStepExecution,
        (stepRunId: string) => {
          currentRunIdRef.current = stepRunId;
        }
      );

      if (state.currentTool.steps) {
        const returnedStepsJson = JSON.stringify(state.currentTool.steps);
        if (originalStepsJson !== returnedStepsJson) {
          setSteps(state.currentTool.steps);
          if (effectiveSelfHealing) {
            toast({
              title: "Tool configuration updated",
              description: "auto-repair has modified the tool configuration to fix issues.",
            });
          }
        }
      }

      if (state.stepResults['__final_transform__']) {
        const normalized = computeStepOutput(state.stepResults['__final_transform__'] as StepExecutionResult);
        const transformRes = state.stepResults['__final_transform__'];
        if (transformRes.success) {
          setFinalResult(normalized.output, 'completed');
        } else if (isAbortError(transformRes.error)) {
          setFinalResult(normalized.output, 'aborted', transformRes.error || undefined);
        } else {
          setFinalResult(normalized.output, 'failed', transformRes.error || undefined);
        }
      }

      const finalData = state.stepResults['__final_transform__']?.data;

      const wr: ToolResult = {
        id: generateUUID(),
        success: state.failedSteps.length === 0,
        data: finalData,
        error: state.stepResults['__final_transform__']?.error,
        startedAt: new Date(),
        completedAt: new Date(),
        stepResults: Object.entries(state.stepResults)
          .filter(([key]) => key !== '__final_transform__')
          .map(([stepId, result]: [string, StepExecutionResult]) => ({
            stepId,
            success: result.success,
            data: result.data,
            error: result.error
          })),
        config: {
          id: toolId,
          steps: state.currentTool.steps,
          finalTransform: state.currentTool.finalTransform || finalTransform,
        } as any
      };

      if (state.currentTool.finalTransform && state.currentTool.finalTransform !== finalTransform) {
        setFinalTransform(state.currentTool.finalTransform);
      }

      if (state.failedSteps.length === 0 && state.abortedSteps.length === 0 && !state.interrupted) {
        setNavigateToFinalSignal(Date.now());
      } else {
        const firstProblematicStep = state.failedSteps[0] || state.abortedSteps[0];
        if (firstProblematicStep) {
          if (firstProblematicStep === '__final_transform__') {
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

      if (onExecute) {
        const executedTool = {
          id: toolId,
          steps: executionSteps,
          finalTransform: state.currentTool.finalTransform || finalTransform,
          responseSchema: currentResponseSchema,
          inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
          instruction: instructions
        } as Tool;
        onExecute(executedTool, wr);
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


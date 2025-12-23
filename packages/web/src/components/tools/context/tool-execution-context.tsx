"use client";
import { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, ReactNode } from 'react';
import { useToolConfig } from './tool-config-context';
import { ExecutionContextValue, StepExecutionState, StepStatus, TransformStatus, DEFAULT_STEP_EXECUTION } from './types';
import { buildStepInput } from '@/src/lib/general-utils';
import { ExecutionStep } from '@superglue/shared';

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export function useExecution(): ExecutionContextValue {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error('useExecution must be used within an ExecutionProvider');
  }
  return context;
}

export function useExecutionOptional(): ExecutionContextValue | null {
  return useContext(ExecutionContext);
}

interface ExecutionProviderProps {
  children: ReactNode;
}

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  const { steps, payload } = useToolConfig();
  
  // === PER-STEP EXECUTION STATE ===
  const [stepExecutions, setStepExecutions] = useState<Record<string, StepExecutionState>>({});
  
  // === TOOL-LEVEL EXECUTION STATE ===
  const [isExecutingAny, setIsExecutingAny] = useState(false);
  const [currentExecutingStepIndex, setCurrentExecutingStepIndexState] = useState<number | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  
  // === FINAL TRANSFORM STATE ===
  const [finalResult, setFinalResultState] = useState<any | null>(null);
  const [finalError, setFinalErrorState] = useState<string | null>(null);
  const [transformStatus, setTransformStatusState] = useState<TransformStatus>('idle');
  
  
  const setStepResult = useCallback((
    stepId: string, 
    result: any, 
    status: StepStatus, 
    error?: string
  ) => {
    setStepExecutions(prev => ({
      ...prev,
      [stepId]: {
        status,
        result,
        error: error ?? null,
        runId: null,
      }
    }));
  }, []);
  
  const setStepRunning = useCallback((stepId: string, runId: string) => {
    setStepExecutions(prev => ({
      ...prev,
      [stepId]: {
        ...(prev[stepId] ?? DEFAULT_STEP_EXECUTION),
        status: 'running',
        runId,
      }
    }));
  }, []);
  
  const clearStepExecution = useCallback((stepId: string) => {
    setStepExecutions(prev => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  }, []);
  
  const resetTransformState = useCallback(() => {
    setFinalResultState(null);
    setFinalErrorState(null);
    setTransformStatusState('idle');
  }, []);
  
  const clearExecutionsFrom = useCallback((stepIndex: number) => {
    const stepIdsToRemove = steps.slice(stepIndex).map(s => s.id);
    setStepExecutions(prev => {
      const next = { ...prev };
      for (const id of stepIdsToRemove) {
        delete next[id];
      }
      return next;
    });
    resetTransformState();
  }, [steps, resetTransformState]);
  
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
      return '';
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
          const stepIdsToRemove = steps.slice(i).map(s => s.id);
          setStepExecutions(prev => {
            const next = { ...prev };
            for (const id of stepIdsToRemove) {
              delete next[id];
            }
            return next;
          });
          resetTransformState();
          break;
        }
      }
    }
    
    prevStepHashesRef.current = currentHashes;
  }, [steps, resetTransformState]);
  
  // === EXECUTION CONTROL ===
  
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
  
  // === TRANSFORM MUTATIONS ===
  
  const setFinalResult = useCallback((result: any, status: TransformStatus, error?: string) => {
    setFinalResultState(result);
    setFinalErrorState(error ?? null);
    setTransformStatusState(status);
  }, []);
  
  const setTransformRunning = useCallback((runId: string) => {
    setTransformStatusState('running');
  }, []);
  
  const setTransformStatus = useCallback((status: TransformStatus) => {
    setTransformStatusState(status);
  }, []);
  
  const clearFinalResult = useCallback(() => {
    setFinalResultState(null);
    setFinalErrorState(null);
    setTransformStatusState('idle');
  }, []);
  
  
  const getStepExecution = useCallback((stepId: string): StepExecutionState => {
    return stepExecutions[stepId] ?? DEFAULT_STEP_EXECUTION;
  }, [stepExecutions]);
  
  const getStepStatus = useCallback((stepId: string): StepStatus => {
    return stepExecutions[stepId]?.status ?? 'pending';
  }, [stepExecutions]);
  
  const getStepResult = useCallback((stepId: string): any | null => {
    return stepExecutions[stepId]?.result ?? null;
  }, [stepExecutions]);
  
  const isStepCompleted = useCallback((stepId: string): boolean => {
    return stepExecutions[stepId]?.status === 'completed';
  }, [stepExecutions]);
  
  const isStepFailed = useCallback((stepId: string): boolean => {
    return stepExecutions[stepId]?.status === 'failed';
  }, [stepExecutions]);
  
  const isStepAborted = useCallback((stepId: string): boolean => {
    return stepExecutions[stepId]?.status === 'aborted';
  }, [stepExecutions]);
  
  const isStepRunning = useCallback((stepId: string): boolean => {
    return stepExecutions[stepId]?.status === 'running';
  }, [stepExecutions]);
  
  const canExecuteStep = useCallback((stepIndex: number): boolean => {
    if (stepIndex === 0) return true;
    for (let i = 0; i < stepIndex; i++) {
      const stepId = steps[i]?.id;
      if (!stepId) return false;
      const status = stepExecutions[stepId]?.status;
      if (status !== 'completed') {
        return false;
      }
    }
    return true;
  }, [steps, stepExecutions]);
  
  const isRunningTransform = transformStatus === 'running';
  const isFixingTransform = transformStatus === 'fixing';
  const isExecutingTransform = isRunningTransform || isFixingTransform;
  
  const canExecuteTransform = useMemo(() => 
    steps.length > 0 && steps.every(s => stepExecutions[s.id]?.status === 'completed'),
    [steps, stepExecutions]
  );
  
  const stepResultsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const [stepId, exec] of Object.entries(stepExecutions)) {
      if (exec.result !== null) {
        map[stepId] = exec.result;
      }
    }
    return map;
  }, [stepExecutions]);
  
  const evolvingPayloads = useMemo(() => {
    const payloads: Record<string, any> = {};
    for (let i = 0; i < steps.length; i++) {
      const stepId = steps[i].id;
      payloads[stepId] = buildStepInput(
        payload.computedPayload,
        steps,
        stepResultsMap,
        i - 1
      );
    }
    return payloads;
  }, [steps, payload.computedPayload, stepResultsMap]);
  
  const sourceDataVersionRef = useRef({
    version: 0,
    payloadRef: null as any,
    resultsRef: null as any,
    stepsLen: 0,
  });
  
  if (
    sourceDataVersionRef.current.payloadRef !== payload.computedPayload ||
    sourceDataVersionRef.current.resultsRef !== stepResultsMap ||
    sourceDataVersionRef.current.stepsLen !== steps.length
  ) {
    sourceDataVersionRef.current = {
      version: sourceDataVersionRef.current.version + 1,
      payloadRef: payload.computedPayload,
      resultsRef: stepResultsMap,
      stepsLen: steps.length,
    };
  }
  
  const sourceDataVersion = sourceDataVersionRef.current.version;
  
  const getEvolvingPayload = useCallback((stepId?: string): Record<string, any> => {
    if (!stepId) {
      if (steps.length === 0) return payload.computedPayload;
      const lastStepId = steps[steps.length - 1].id;
      return evolvingPayloads[lastStepId] ?? payload.computedPayload;
    }
    return evolvingPayloads[stepId] ?? payload.computedPayload;
  }, [steps, evolvingPayloads, payload.computedPayload]);
  
  
  const value = useMemo<ExecutionContextValue>(() => ({
    stepExecutions,
    isExecutingAny,
    currentExecutingStepIndex,
    currentRunId,
    isStopping,
    
    // Final transform state
    finalResult,
    finalError,
    transformStatus,
    
    // Transform status convenience getters
    isRunningTransform,
    isFixingTransform,
    isExecutingTransform,
    canExecuteTransform,
    
    // Step mutations
    setStepResult,
    setStepRunning,
    clearStepExecution,
    clearExecutionsFrom,
    clearAllExecutions,
    
    // Execution control
    startExecution,
    stopExecution,
    markAsStopping,
    finishExecution,
    setCurrentExecutingStepIndex,
    skipNextHashInvalidation,
    
    // Transform mutations
    setFinalResult,
    setTransformRunning,
    setTransformStatus,
    clearFinalResult,
    
    // Step queries
    getStepExecution,
    getStepStatus,
    getStepResult,
    isStepCompleted,
    isStepFailed,
    isStepAborted,
    isStepRunning,
    canExecuteStep,
    
    // Payload helpers
    getEvolvingPayload,
    stepResultsMap,
    sourceDataVersion,
  }), [
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
    isStepCompleted,
    isStepFailed,
    isStepAborted,
    isStepRunning,
    canExecuteStep,
    getEvolvingPayload,
    stepResultsMap,
    sourceDataVersion,
  ]);
  
  return (
    <ExecutionContext.Provider value={value}>
      {children}
    </ExecutionContext.Provider>
  );
}


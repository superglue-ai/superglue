"use client";

import { UploadedFileInfo } from "@/src/lib/file-utils";
import { computeToolPayload } from "@/src/lib/general-utils";
import { getPayload, addDraft } from "@/src/lib/storage";
import { ExecutionStep, System, ResponseFilter, Tool } from "@superglue/shared";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PayloadState, ToolConfigContextValue, ToolDefinition } from "./types";

function checkPayloadKeysReferenced(
  steps: ExecutionStep[],
  finalTransform: string,
  payloadKeys: string[],
): boolean {
  if (payloadKeys.length === 0) return true;

  const patternCache = new Map<string, RegExp>();
  const buildPatternForKey = (key: string): RegExp => {
    let pattern = patternCache.get(key);
    if (!pattern) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern = new RegExp(
        `sourceData\\.${escaped}(?![a-zA-Z0-9_])|sourceData\\[\\s*\\\\?['"]${escaped}\\\\?['"]\\s*\\]|<<\\s*${escaped}\\s*>>`,
      );
      patternCache.set(key, pattern);
    }
    return pattern;
  };

  const checkStringForAnyKey = (str: string | undefined | null): boolean => {
    if (!str) return false;
    return payloadKeys.some((key) => buildPatternForKey(key).test(str));
  };

  const checkValueForAnyKey = (val: unknown): boolean => {
    if (!val) return false;
    const str = typeof val === "string" ? val : JSON.stringify(val);
    return checkStringForAnyKey(str);
  };

  for (const step of steps) {
    const { dataSelector } = step;
    if (checkStringForAnyKey(dataSelector)) return true;

    const config = step.config as RequestStepConfig;
    if (checkValueForAnyKey(config.url)) return true;
    if (checkValueForAnyKey(config.body)) return true;
    if (checkValueForAnyKey(config.queryParams)) return true;
    if (checkValueForAnyKey(config.headers)) return true;
  }

  if (checkStringForAnyKey(finalTransform)) return true;

  return false;
}

interface ToolConfigProviderProps {
  initialTool?: Tool;
  initialPayload?: string;
  initialInstruction?: string;
  systems?: System[];
  // External state for embedded mode
  externalUploadedFiles?: UploadedFileInfo[];
  externalFilePayloads?: Record<string, any>;
  onExternalFilesChange?: (files: UploadedFileInfo[], payloads: Record<string, any>) => void;
  children: ReactNode;
}

const ToolConfigContext = createContext<ToolConfigContextValue | null>(null);

export function useToolConfig(): ToolConfigContextValue {
  const context = useContext(ToolConfigContext);
  if (!context) {
    throw new Error("useToolConfig must be used within a ToolConfigProvider");
  }
  return context;
}

export function ToolConfigProvider({
  initialTool,
  initialPayload = "{}",
  initialInstruction,
  systems = [],
  externalUploadedFiles,
  externalFilePayloads,
  onExternalFilesChange,
  children,
}: ToolConfigProviderProps) {
  const [toolId, setToolId] = useState(initialTool?.id || "");
  const [steps, setSteps] = useState<ExecutionStep[]>(initialTool?.steps || []);
  const [instruction, setInstruction] = useState(
    initialInstruction || initialTool?.instruction || "",
  );
  const [finalTransform, setFinalTransform] = useState(
    initialTool?.finalTransform || "(sourceData) => { return {} }",
  );
  const [responseSchema, setResponseSchema] = useState<string>(
    initialTool?.responseSchema ? JSON.stringify(initialTool.responseSchema, null, 2) : "",
  );
  const [inputSchema, setInputSchema] = useState<string | null>(
    initialTool?.inputSchema ? JSON.stringify(initialTool.inputSchema, null, 2) : null,
  );
  const [folder, setFolder] = useState<string | undefined>(initialTool?.folder);
  const [isArchived, setIsArchived] = useState(initialTool?.archived || false);
  const [responseFilters, setResponseFilters] = useState<ResponseFilter[]>(
    initialTool?.responseFilters || [],
  );

  const [manualPayloadText, setManualPayloadText] = useState(initialPayload);
  const [localUploadedFiles, setLocalUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [localFilePayloads, setLocalFilePayloads] = useState<Record<string, any>>({});
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const initialStateRef = useRef<string | null>(null);
  const [initialStateReady, setInitialStateReady] = useState(false);

  // Set initial baseline state for draft comparison
  useEffect(() => {
    if (initialStateReady) return;

    // Case 1: Tool loaded from server (initialTool provided)
    if (initialTool?.id) {
      const state = JSON.stringify({
        steps: initialTool.steps || [],
        instruction: initialInstruction || initialTool.instruction || "",
        finalTransform: initialTool.finalTransform || "(sourceData) => { return {} }",
        inputSchema: initialTool.inputSchema
          ? JSON.stringify(initialTool.inputSchema, null, 2)
          : null,
        responseSchema: initialTool.responseSchema
          ? JSON.stringify(initialTool.responseSchema, null, 2)
          : "",
      });
      initialStateRef.current = state;
      lastAttemptedSaveRef.current = null; // Allow detecting first change
      setInitialStateReady(true);
      return;
    }

    // Case 2: Tool state exists but no initialTool (e.g., created in-session)
    if (toolId && steps.length > 0) {
      const state = JSON.stringify({
        steps,
        instruction,
        finalTransform,
        inputSchema,
        responseSchema,
      });
      initialStateRef.current = state;
      lastAttemptedSaveRef.current = state; // Don't save current state as draft
      setInitialStateReady(true);
    }
  }, [
    initialTool,
    initialInstruction,
    toolId,
    steps,
    instruction,
    finalTransform,
    inputSchema,
    responseSchema,
    initialStateReady,
  ]);

  const uploadedFiles = externalUploadedFiles ?? localUploadedFiles;
  const filePayloads = externalFilePayloads ?? localFilePayloads;

  useEffect(() => {
    if (!toolId) return;

    let cancelled = false;

    const loadPayload = async () => {
      try {
        const savedPayload = await getPayload(toolId);
        if (!cancelled && savedPayload && savedPayload !== initialPayload) {
          setManualPayloadText(savedPayload);
        }
      } catch (error) {
        console.error("Failed to load payload from IndexedDB:", error);
        // Fallback to localStorage during migration
        try {
          const STORAGE_KEY = `superglue-payload:${toolId}`;
          const localPayload = localStorage.getItem(STORAGE_KEY);
          if (!cancelled && localPayload && localPayload !== initialPayload) {
            setManualPayloadText(localPayload);
          }
        } catch (localError) {
          console.error("Failed to load payload from localStorage:", localError);
        }
      }
    };

    loadPayload();

    return () => {
      cancelled = true;
    };
  }, [toolId, initialPayload]);

  const lastAttemptedSaveRef = useRef<string | null>(null);
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDraftRef = useRef<{
    toolId: string;
    steps: ExecutionStep[];
    instruction: string;
    finalTransform: string;
    inputSchema: string | null;
    responseSchema: string;
  } | null>(null);

  useEffect(() => {
    if (!toolId || !toolId.trim()) return;

    if (!initialStateReady) {
      return;
    }

    const currentState = JSON.stringify({
      steps,
      instruction,
      finalTransform,
      inputSchema,
      responseSchema,
    });

    if (currentState === initialStateRef.current) {
      pendingDraftRef.current = null;
      return;
    }

    if (currentState === lastAttemptedSaveRef.current) {
      pendingDraftRef.current = null;
      return;
    }

    // Track pending draft for save on unmount
    const draftData = {
      toolId,
      steps,
      instruction,
      finalTransform,
      inputSchema,
      responseSchema,
    };
    pendingDraftRef.current = draftData;

    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(() => {
      lastAttemptedSaveRef.current = currentState;
      pendingDraftRef.current = null;

      addDraft(toolId, draftData).catch((error) => {
        console.error("Failed to save draft:", error);
      });
    }, 1000);

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, [toolId, steps, instruction, finalTransform, inputSchema, responseSchema, initialStateReady]);

  // Save pending draft on unmount
  useEffect(() => {
    return () => {
      if (pendingDraftRef.current) {
        const draft = pendingDraftRef.current;
        // Fire and forget - component is unmounting
        addDraft(draft.toolId, draft).catch((error) => {
          console.error("Failed to save draft on unmount:", error);
        });
      }
    };
  }, []);

  const setFilesAndPayloads = useCallback(
    (files: UploadedFileInfo[], payloads: Record<string, any>) => {
      if (onExternalFilesChange) {
        onExternalFilesChange(files, payloads);
      } else {
        setLocalUploadedFiles(files);
        setLocalFilePayloads(payloads);
      }
    },
    [onExternalFilesChange],
  );

  const setUploadedFiles = useCallback(
    (files: UploadedFileInfo[]) => {
      if (onExternalFilesChange) {
        // Use the combined setter to ensure atomic update
        onExternalFilesChange(files, filePayloads);
      } else {
        setLocalUploadedFiles(files);
      }
    },
    [onExternalFilesChange, filePayloads],
  );

  const setFilePayloads = useCallback(
    (payloads: Record<string, any>) => {
      if (onExternalFilesChange) {
        // Use the combined setter to ensure atomic update
        onExternalFilesChange(uploadedFiles, payloads);
      } else {
        setLocalFilePayloads(payloads);
      }
    },
    [onExternalFilesChange, uploadedFiles],
  );

  const computedPayload = useMemo(
    () => computeToolPayload(manualPayloadText, filePayloads),
    [manualPayloadText, filePayloads],
  );

  const tool = useMemo<ToolDefinition>(() => {
    let parsedInputSchema = null;
    let parsedResponseSchema = null;
    try {
      if (inputSchema) parsedInputSchema = JSON.parse(inputSchema);
    } catch {
      // Invalid JSON, keep as null
    }
    try {
      if (responseSchema) parsedResponseSchema = JSON.parse(responseSchema);
    } catch {
      // Invalid JSON, keep as null
    }
    return {
      id: toolId,
      instruction,
      finalTransform,
      inputSchema: parsedInputSchema,
      responseSchema: parsedResponseSchema,
      folder,
      isArchived,
      responseFilters,
    };
  }, [
    toolId,
    instruction,
    finalTransform,
    inputSchema,
    responseSchema,
    folder,
    isArchived,
    responseFilters,
  ]);

  const payload = useMemo<PayloadState>(
    () => ({
      manualPayloadText,
      uploadedFiles,
      filePayloads,
      computedPayload,
      hasUserEdited,
    }),
    [manualPayloadText, uploadedFiles, filePayloads, computedPayload, hasUserEdited],
  );

  const addStep = useCallback((step: ExecutionStep, afterIndex?: number) => {
    setSteps((prev) => {
      if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < prev.length) {
        const next = [...prev];
        next.splice(afterIndex + 1, 0, step);
        return next;
      }
      return [...prev, step];
    });
  }, []);

  const removeStep = useCallback((stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  }, []);

  const updateStep = useCallback((stepId: string, updates: Partial<ExecutionStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...updates } : s)));
  }, []);

  const getStepConfig = useCallback(
    (stepId: string) => {
      return steps.find((s) => s.id === stepId);
    },
    [steps],
  );

  const getStepIndex = useCallback(
    (stepId: string) => {
      return steps.findIndex((s) => s.id === stepId);
    },
    [steps],
  );

  const getStepSystem = useCallback(
    (stepId: string) => {
      const step = steps.find((s) => s.id === stepId);
      if (!step?.systemId) return undefined;
      return systems.find((i) => i.id === step.systemId);
    },
    [steps, systems],
  );

  // Mark current state as baseline to prevent auto-save after restore
  const markCurrentStateAsBaseline = useCallback(() => {
    const currentState = JSON.stringify({
      steps,
      instruction,
      finalTransform,
      inputSchema,
      responseSchema,
    });
    initialStateRef.current = currentState;
    lastAttemptedSaveRef.current = currentState;
  }, [steps, instruction, finalTransform, inputSchema, responseSchema]);

  const isPayloadReferenced = useMemo(() => {
    const payloadKeys = Object.keys(computedPayload || {});
    return checkPayloadKeysReferenced(steps, finalTransform, payloadKeys);
  }, [steps, finalTransform, computedPayload]);

  const value = useMemo<ToolConfigContextValue>(
    () => ({
      tool,
      steps,
      payload,
      systems,

      inputSchema,
      responseSchema,
      finalTransform,
      responseFilters,

      setToolId,
      setInstruction,
      setFinalTransform,
      setInputSchema,
      setResponseSchema,
      setFolder,
      setIsArchived,
      setResponseFilters,

      setPayloadText: setManualPayloadText,
      setUploadedFiles,
      setFilePayloads,
      setFilesAndPayloads,
      markPayloadEdited: () => setHasUserEdited(true),
      markCurrentStateAsBaseline,

      addStep,
      removeStep,
      updateStep,
      setSteps,

      getStepConfig,
      getStepIndex,
      getStepSystem,

      isPayloadReferenced,
    }),
    [
      tool,
      steps,
      payload,
      systems,
      inputSchema,
      responseSchema,
      finalTransform,
      responseFilters,
      addStep,
      removeStep,
      updateStep,
      setFilesAndPayloads,
      markCurrentStateAsBaseline,
      getStepConfig,
      getStepIndex,
      getStepSystem,
      isPayloadReferenced,
    ],
  );

  return <ToolConfigContext.Provider value={value}>{children}</ToolConfigContext.Provider>;
}

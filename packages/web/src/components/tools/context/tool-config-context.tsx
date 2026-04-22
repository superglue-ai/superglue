"use client";

import { UploadedFileInfo } from "@/src/lib/file-utils";
import { computeToolPayload } from "@/src/lib/general-utils";
import { getPayload, setPayload, addDraft } from "@/src/lib/storage";
import {
  ExecutionFileEnvelope,
  RequestStepConfig,
  ToolStep,
  System,
  ResponseFilter,
  Tool,
  isRequestConfig,
  isTransformConfig,
} from "@superglue/shared";
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

// Normalize a value that might be a JSON string or an object
// This ensures consistent comparison regardless of whether the value
// is stored as a parsed object or a JSON string
function normalizeJsonValue(val: unknown): unknown {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return val;
      }
    }
  }
  return val;
}

function normalizeFunctionLikeString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.includes("=>") && !trimmed.startsWith("function")) {
    return value;
  }

  // Normalize whitespace and formatting to prevent prettier changes from triggering "unsaved"
  return trimmed
    .replace(/;+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}()[\],;:])\s*/g, "$1")
    .trim();
}

// Deep normalize an object, parsing any JSON strings found in headers/queryParams/body
function deepNormalizeForComparison(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(deepNormalizeForComparison);
  }
  if (typeof obj === "string") {
    return normalizeFunctionLikeString(obj);
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Normalize JSON-like fields
      if (key === "headers" || key === "queryParams" || key === "body") {
        result[key] = normalizeJsonValue(value);
      } else {
        result[key] = deepNormalizeForComparison(value);
      }
    }
    return result;
  }
  return obj;
}

type ComparisonStateInput = {
  steps: ToolStep[];
  instruction: string;
  outputTransform: string;
  inputSchema: string | null;
  outputSchema: string;
  folder?: string;
  responseFilters: ResponseFilter[];
};

function normalizeComparisonState({ responseFilters, ...state }: ComparisonStateInput): unknown {
  return deepNormalizeForComparison({
    ...state,
    ...(state.folder ? { folder: state.folder } : {}),
    ...(responseFilters.length > 0 ? { responseFilters } : {}),
  });
}

function checkPayloadKeysReferenced(
  steps: ToolStep[],
  outputTransform: string,
  payloadKeys: string[],
): boolean {
  if (payloadKeys.length === 0) return true;

  const patternCache = new Map<string, RegExp>();
  const buildPatternForKey = (key: string): RegExp => {
    let pattern = patternCache.get(key);
    if (!pattern) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match any of:
      // - sourceData.key or sourceData["key"] (explicit sourceData reference)
      // - <<key>> (template syntax)
      // - .key or ["key"] preceded by word char (any object property access, e.g., s.key, data.key)
      pattern = new RegExp(
        `sourceData\\.${escaped}(?![a-zA-Z0-9_])|sourceData\\[\\s*\\\\?['"]${escaped}\\\\?['"]\\s*\\]|<<\\s*${escaped}\\s*>>|\\w\\.${escaped}(?![a-zA-Z0-9_])|\\w\\[\\s*['"]${escaped}['"]\\s*\\]`,
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

    // Check request step config fields
    if (isRequestConfig(step.config)) {
      const config = step.config as RequestStepConfig;
      if (checkValueForAnyKey(config.url)) return true;
      if (checkValueForAnyKey(config.body)) return true;
      if (checkValueForAnyKey(config.queryParams)) return true;
      if (checkValueForAnyKey(config.headers)) return true;
    }

    // Check transform step transformCode
    if (isTransformConfig(step.config)) {
      if (checkStringForAnyKey(step.config.transformCode)) return true;
    }
  }

  if (checkStringForAnyKey(outputTransform)) return true;

  return false;
}

interface ToolConfigProviderProps {
  initialTool?: Tool;
  initialPayload?: string;
  initialInstruction?: string;
  systems?: System[];
  // External state for embedded mode
  externalUploadedFiles?: UploadedFileInfo[];
  externalFilePayloads?: Record<string, ExecutionFileEnvelope>;
  onExternalFilesChange?: (
    files: UploadedFileInfo[],
    payloads: Record<string, ExecutionFileEnvelope>,
  ) => void;
  // Skip loading payload from local storage (e.g., when restoring a run)
  skipLocalPayloadLoad?: boolean;
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

export function useToolConfigOptional(): ToolConfigContextValue | null {
  return useContext(ToolConfigContext);
}

export function ToolConfigProvider({
  initialTool,
  initialPayload = "{}",
  initialInstruction,
  systems = [],
  externalUploadedFiles,
  externalFilePayloads,
  onExternalFilesChange,
  skipLocalPayloadLoad = false,
  children,
}: ToolConfigProviderProps) {
  const [toolId, setToolId] = useState(initialTool?.id || "");
  const [steps, setSteps] = useState<ToolStep[]>(initialTool?.steps || []);
  const [instruction, setInstruction] = useState(
    initialInstruction || initialTool?.instruction || "",
  );
  const [outputTransform, setOutputTransform] = useState(
    initialTool?.outputTransform || "(sourceData) => { return {} }",
  );
  const [outputSchema, setOutputSchema] = useState<string>(
    initialTool?.outputSchema ? JSON.stringify(initialTool.outputSchema, null, 2) : "",
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
  const [localFilePayloads, setLocalFilePayloads] = useState<
    Record<string, ExecutionFileEnvelope>
  >({});
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const initialStateRef = useRef<string | null>(null);
  const [initialStateReady, setInitialStateReady] = useState(false);
  const [baselineVersion, setBaselineVersion] = useState(0); // Triggers re-computation of hasUnsavedChanges
  const [unsavedChangesSuppressed, setUnsavedChangesSuppressed] = useState(false);

  // Set initial baseline state for draft comparison
  useEffect(() => {
    if (initialStateReady) return;

    // Case 1: Tool loaded from server (initialTool provided)
    if (initialTool?.id) {
      const state = JSON.stringify(
        normalizeComparisonState({
          steps: initialTool.steps || [],
          instruction: initialInstruction || initialTool.instruction || "",
          outputTransform: initialTool.outputTransform || "(sourceData) => { return {} }",
          inputSchema: initialTool.inputSchema
            ? JSON.stringify(initialTool.inputSchema, null, 2)
            : null,
          outputSchema: initialTool.outputSchema
            ? JSON.stringify(initialTool.outputSchema, null, 2)
            : "",
          folder: initialTool.folder,
          responseFilters: initialTool.responseFilters || [],
        }),
      );
      initialStateRef.current = state;
      lastAttemptedSaveRef.current = null; // Allow detecting first change
      setInitialStateReady(true);
      return;
    }

    // Case 2: Tool state exists but no initialTool (e.g., created in-session)
    if (toolId && steps.length > 0) {
      const state = JSON.stringify(
        normalizeComparisonState({
          steps,
          instruction,
          outputTransform,
          inputSchema,
          outputSchema,
          folder,
          responseFilters,
        }),
      );
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
    outputTransform,
    inputSchema,
    outputSchema,
    folder,
    responseFilters,
    initialStateReady,
  ]);

  const uploadedFiles = externalUploadedFiles ?? localUploadedFiles;
  const filePayloads = externalFilePayloads ?? localFilePayloads;

  useEffect(() => {
    if (!toolId || skipLocalPayloadLoad) return;

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
  }, [toolId, initialPayload, skipLocalPayloadLoad]);

  // Persist payload to IndexedDB whenever it changes (debounced)
  const payloadSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPayloadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!toolId || !toolId.trim()) return;

    const MAX_PAYLOAD_SIZE = 1000 * 1024; // Only cache small payloads (1MB)
    const DEBOUNCE_MS = 1000;

    // Track pending payload for save on unmount
    pendingPayloadRef.current = manualPayloadText;

    if (payloadSaveTimeoutRef.current) {
      clearTimeout(payloadSaveTimeoutRef.current);
    }

    payloadSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const trimmed = (manualPayloadText || "").trim();
        if (trimmed === "" || trimmed === "{}") {
          await setPayload(toolId, "");
          pendingPayloadRef.current = null;
          return;
        }

        const payloadSize = new Blob([manualPayloadText]).size;
        if (payloadSize > MAX_PAYLOAD_SIZE) {
          await setPayload(toolId, "");
          pendingPayloadRef.current = null;
          return;
        }

        await setPayload(toolId, manualPayloadText);
        pendingPayloadRef.current = null;
      } catch (error) {
        console.error("Error saving payload:", error);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (payloadSaveTimeoutRef.current) {
        clearTimeout(payloadSaveTimeoutRef.current);
      }
    };
  }, [toolId, manualPayloadText]);

  // Save pending payload on unmount
  useEffect(() => {
    const toolIdCopy = toolId;
    return () => {
      if (pendingPayloadRef.current !== null && toolIdCopy) {
        const payload = pendingPayloadRef.current;
        const MAX_PAYLOAD_SIZE = 1000 * 1024;
        const trimmed = (payload || "").trim();

        if (trimmed === "" || trimmed === "{}" || new Blob([payload]).size > MAX_PAYLOAD_SIZE) {
          setPayload(toolIdCopy, "").catch(console.error);
        } else {
          setPayload(toolIdCopy, payload).catch(console.error);
        }
      }
    };
  }, [toolId]);

  const lastAttemptedSaveRef = useRef<string | null>(null);
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDraftRef = useRef<{
    toolId: string;
    steps: ToolStep[];
    instruction: string;
    outputTransform: string;
    inputSchema: string | null;
    outputSchema: string;
  } | null>(null);

  useEffect(() => {
    if (!toolId || !toolId.trim()) return;

    if (!initialStateReady) {
      return;
    }

    // Normalize to ensure consistent comparison with initialStateRef and lastAttemptedSaveRef
    const currentState = JSON.stringify(
      deepNormalizeForComparison({
        steps,
        instruction,
        outputTransform,
        inputSchema,
        outputSchema,
      }),
    );

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
      outputTransform,
      inputSchema,
      outputSchema,
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
  }, [toolId, steps, instruction, outputTransform, inputSchema, outputSchema, initialStateReady]);

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
    (files: UploadedFileInfo[], payloads: Record<string, ExecutionFileEnvelope>) => {
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
    (payloads: Record<string, ExecutionFileEnvelope>) => {
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
    let parsedOutputSchema = null;
    try {
      if (inputSchema) parsedInputSchema = JSON.parse(inputSchema);
    } catch {
      // Invalid JSON, keep as null
    }
    try {
      if (outputSchema) parsedOutputSchema = JSON.parse(outputSchema);
    } catch {
      // Invalid JSON, keep as null
    }
    return {
      id: toolId,
      instruction,
      outputTransform,
      inputSchema: parsedInputSchema,
      outputSchema: parsedOutputSchema,
      folder,
      isArchived,
      responseFilters,
    };
  }, [
    toolId,
    instruction,
    outputTransform,
    inputSchema,
    outputSchema,
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

  const addStep = useCallback((step: ToolStep, afterIndex?: number) => {
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

  const updateStep = useCallback((stepId: string, updates: Partial<ToolStep>) => {
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
      if (!step?.config || !isRequestConfig(step.config)) return undefined;
      const systemId = (step.config as RequestStepConfig).systemId;
      if (!systemId) return undefined;
      return systems.find((i) => i.id === systemId);
    },
    [steps, systems],
  );

  // Keep a ref to the latest state values so markCurrentStateAsBaseline always captures current state
  // Updated during render (not in useEffect) to ensure it's always in sync when markCurrentStateAsBaseline is called
  const latestStateRef = useRef({
    steps,
    instruction,
    outputTransform,
    inputSchema,
    outputSchema,
    folder,
    responseFilters,
  });
  latestStateRef.current = {
    steps,
    instruction,
    outputTransform,
    inputSchema,
    outputSchema,
    folder,
    responseFilters,
  };

  // Mark current state as baseline - always uses latest state from ref
  // Normalize to ensure consistent comparison
  const markCurrentStateAsBaseline = useCallback(() => {
    const currentState = JSON.stringify(
      normalizeComparisonState({
        steps: latestStateRef.current.steps,
        instruction: latestStateRef.current.instruction,
        outputTransform: latestStateRef.current.outputTransform,
        inputSchema: latestStateRef.current.inputSchema,
        outputSchema: latestStateRef.current.outputSchema,
        folder: latestStateRef.current.folder,
        responseFilters: latestStateRef.current.responseFilters,
      }),
    );
    initialStateRef.current = currentState;
    lastAttemptedSaveRef.current = currentState;
    setBaselineVersion((v) => v + 1); // Trigger re-computation of hasUnsavedChanges
  }, []);

  const isPayloadReferenced = useMemo(() => {
    const payloadKeys = Object.keys(computedPayload || {});
    return checkPayloadKeysReferenced(steps, outputTransform, payloadKeys);
  }, [steps, outputTransform, computedPayload]);

  const hasUnsavedChanges = useMemo(() => {
    if (unsavedChangesSuppressed) return false;
    if (!initialStateReady || !initialStateRef.current) return false;
    const currentState = JSON.stringify(
      normalizeComparisonState({
        steps,
        instruction,
        outputTransform,
        inputSchema,
        outputSchema,
        folder,
        responseFilters,
      }),
    );
    return currentState !== initialStateRef.current;
  }, [
    steps,
    instruction,
    outputTransform,
    inputSchema,
    outputSchema,
    folder,
    responseFilters,
    initialStateReady,
    baselineVersion,
    unsavedChangesSuppressed,
  ]);

  const value = useMemo<ToolConfigContextValue>(
    () => ({
      tool,
      steps,
      payload,
      systems,

      inputSchema,
      outputSchema,
      outputTransform,
      responseFilters,

      setToolId,
      setInstruction,
      setOutputTransform,
      setInputSchema,
      setOutputSchema,
      setFolder,
      setIsArchived,
      setResponseFilters,

      setPayloadText: setManualPayloadText,
      setUploadedFiles,
      setFilePayloads,
      setFilesAndPayloads,
      markPayloadEdited: () => setHasUserEdited(true),
      markCurrentStateAsBaseline,
      setUnsavedChangesSuppressed,

      addStep,
      removeStep,
      updateStep,
      setSteps,

      getStepConfig,
      getStepIndex,
      getStepSystem,

      isPayloadReferenced,
      hasUnsavedChanges,
    }),
    [
      tool,
      steps,
      payload,
      systems,
      inputSchema,
      outputSchema,
      outputTransform,
      responseFilters,
      addStep,
      removeStep,
      updateStep,
      setFilesAndPayloads,
      markCurrentStateAsBaseline,
      setUnsavedChangesSuppressed,
      getStepConfig,
      getStepIndex,
      getStepSystem,
      isPayloadReferenced,
      hasUnsavedChanges,
    ],
  );

  return <ToolConfigContext.Provider value={value}>{children}</ToolConfigContext.Provider>;
}

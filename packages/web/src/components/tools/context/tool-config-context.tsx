"use client";

import { createContext, useContext, useCallback, useMemo, useState, ReactNode } from "react";
import { ExecutionStep, Integration, Tool } from "@superglue/shared";
import { computeToolPayload } from "@/src/lib/general-utils";
import { UploadedFileInfo } from "@/src/lib/file-utils";
import { ToolConfigContextValue, ToolDefinition, PayloadState } from "./types";

interface ToolConfigProviderProps {
  initialTool?: Tool;
  initialPayload?: string;
  initialInstruction?: string;
  integrations?: Integration[];
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
  integrations = [],
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

  const [manualPayloadText, setManualPayloadText] = useState(initialPayload);
  const [localUploadedFiles, setLocalUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [localFilePayloads, setLocalFilePayloads] = useState<Record<string, any>>({});
  const [hasUserEdited, setHasUserEdited] = useState(false);

  // Use external state if provided (embedded mode), otherwise use local state
  const uploadedFiles = externalUploadedFiles ?? localUploadedFiles;
  const filePayloads = externalFilePayloads ?? localFilePayloads;

  const setUploadedFiles = useCallback(
    (files: UploadedFileInfo[]) => {
      if (onExternalFilesChange) {
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
    };
  }, [toolId, instruction, finalTransform, inputSchema, responseSchema, folder, isArchived]);

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

  const getStepIntegration = useCallback(
    (stepId: string) => {
      const step = steps.find((s) => s.id === stepId);
      if (!step?.integrationId) return undefined;
      return integrations.find((i) => i.id === step.integrationId);
    },
    [steps, integrations],
  );

  const value = useMemo<ToolConfigContextValue>(
    () => ({
      tool,
      steps,
      payload,
      integrations,

      inputSchema,
      responseSchema,
      finalTransform,

      setToolId,
      setInstruction,
      setFinalTransform,
      setInputSchema,
      setResponseSchema,
      setFolder,
      setIsArchived,

      setPayloadText: setManualPayloadText,
      setUploadedFiles,
      setFilePayloads,
      markPayloadEdited: () => setHasUserEdited(true),

      addStep,
      removeStep,
      updateStep,
      setSteps,

      getStepConfig,
      getStepIndex,
      getStepIntegration,
    }),
    [
      tool,
      steps,
      payload,
      integrations,
      inputSchema,
      responseSchema,
      finalTransform,
      addStep,
      removeStep,
      updateStep,
      getStepConfig,
      getStepIndex,
      getStepIntegration,
    ],
  );

  return <ToolConfigContext.Provider value={value}>{children}</ToolConfigContext.Provider>;
}

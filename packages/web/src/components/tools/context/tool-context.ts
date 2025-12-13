import { createContext, useContext, useCallback, useMemo, useState, ReactNode } from 'react';
import { ExecutionStep, Integration, Tool } from '@superglue/shared';
import { computeToolPayload } from '@/src/lib/general-utils';
import { ToolContextValue, ToolDefinition, PayloadState } from './types';

const ToolContext = createContext<ToolContextValue | null>(null);

export function useTool(): ToolContextValue {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error('useTool must be used within a ToolProvider');
  }
  return context;
}

interface ToolProviderProps {
  initialTool?: Tool;
  initialPayload?: string;
  integrations?: Integration[];
  readOnly?: boolean;
  children: ReactNode;
}

export function ToolProvider({
  initialTool,
  initialPayload = '{}',
  integrations = [],
  readOnly = false,
  children,
}: ToolProviderProps) {
  // Tool definition state
  const [toolId, setToolId] = useState(initialTool?.id || '');
  const [steps, setSteps] = useState<ExecutionStep[]>(initialTool?.steps || []);
  const [finalTransform, setFinalTransform] = useState(
    initialTool?.finalTransform || '(sourceData) => { return sourceData; }'
  );
  const [responseSchema, setResponseSchema] = useState<string>(
    initialTool?.responseSchema ? JSON.stringify(initialTool.responseSchema, null, 2) : ''
  );
  const [inputSchema, setInputSchema] = useState<string | null>(
    initialTool?.inputSchema ? JSON.stringify(initialTool.inputSchema, null, 2) : null
  );
  const [instruction, setInstruction] = useState(initialTool?.instruction || '');

  // Payload state
  const [manualPayloadText, setManualPayloadText] = useState(initialPayload);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});
  const [hasUserEdited, setHasUserEdited] = useState(false);

  // Computed payload
  const computedPayload = useMemo(
    () => computeToolPayload(manualPayloadText, filePayloads),
    [manualPayloadText, filePayloads]
  );

  // Payload validation (simplified - you'd want your actual validation logic)
  const isPayloadValid = useMemo(() => {
    // ... validation logic
    return true;
  }, [computedPayload, inputSchema, hasUserEdited]);

  // Step update with cascade logic
  const updateStep = useCallback((stepId: string, updatedStep: ExecutionStep, isUserInitiated = false) => {
    setSteps(prev => prev.map(s => s.id === stepId ? updatedStep : s));
    // Note: cascade invalidation now happens in ExecutionContext via sourceDataVersion
  }, []);

  // Compose the tool definition object
  const tool = useMemo<ToolDefinition>(() => ({
    id: toolId,
    steps,
    finalTransform,
    responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
    inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
    instruction,
  }), [toolId, steps, finalTransform, responseSchema, inputSchema, instruction]);

  // Compose the payload state object
  const payload = useMemo<PayloadState>(() => ({
    manualPayloadText,
    uploadedFiles,
    filePayloads,
    computedPayload,
    isValid: isPayloadValid,
    hasUserEdited,
  }), [manualPayloadText, uploadedFiles, filePayloads, computedPayload, isPayloadValid, hasUserEdited]);

  // File upload handlers (simplified)
  const uploadFiles = useCallback(async (files: File[]) => {
    // ... file processing logic
    setHasUserEdited(true);
  }, []);

  const removeFile = useCallback((key: string) => {
    setUploadedFiles(prev => prev.filter(f => f.key !== key));
    setFilePayloads(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const value = useMemo<ToolContextValue>(() => ({
    tool,
    payload,
    integrations,
    readOnly,
    setToolId,
    updateStep,
    setSteps,
    setFinalTransform: (t: string) => setFinalTransform(t),
    setResponseSchema: (s: string) => setResponseSchema(s),
    setInputSchema,
    setInstruction,
    setPayloadText: setManualPayloadText,
    uploadFiles,
    removeFile,
    markPayloadEdited: () => setHasUserEdited(true),
  }), [tool, payload, integrations, readOnly, updateStep, uploadFiles, removeFile]);

  return <ToolContext.Provider value={value}>{children}</ToolContext.Provider>;
}
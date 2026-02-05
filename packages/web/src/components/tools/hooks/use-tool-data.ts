import { useConfig } from "@/src/app/config-context";
import { useToast } from "@/src/hooks/use-toast";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { deleteAllDrafts } from "@/src/lib/storage";
import { Tool } from "@superglue/shared";
import { useEffect, useState } from "react";
import { useExecution, useToolConfig } from "../context";

interface UseToolDataOptions {
  id?: string;
  initialTool?: Tool;
  initialInstruction?: string;
  embedded?: boolean;
  onSave?: (tool: Tool, payload: Record<string, any>) => Promise<void>;
}

export function useToolData(options: UseToolDataOptions) {
  const { id, initialTool, initialInstruction, embedded, onSave } = options;

  const config = useConfig();
  const { toast } = useToast();
  const {
    tool,
    steps,
    payload,
    responseFilters,
    setToolId,
    setSteps,
    setOutputTransform,
    setOutputSchema,
    setInputSchema,
    setInstruction,
    setPayloadText,
    setFolder,
    setIsArchived,
    setResponseFilters,
  } = useToolConfig();

  const { clearAllExecutions } = useExecution();

  const toolId = tool.id;
  const folder = tool.folder;
  const outputTransform = tool.outputTransform || "";
  const outputSchema = tool.outputSchema ? JSON.stringify(tool.outputSchema) : "";
  const inputSchema = tool.inputSchema ? JSON.stringify(tool.inputSchema) : "";
  const instructions = tool.instruction;
  const computedPayload = payload.computedPayload;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lastToolId, setLastToolId] = useState<string | undefined>(initialTool?.id);

  const loadTool = async (idToLoad: string) => {
    try {
      if (!idToLoad) return;
      setLoading(true);
      setNotFound(false);
      const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      const loadedTool = await client.getWorkflow(idToLoad);
      if (!loadedTool) {
        throw new Error(`Tool with ID "${idToLoad}" not found.`);
      }
      setToolId(loadedTool.id || "");
      setFolder(loadedTool.folder);
      setIsArchived(loadedTool.archived || false);
      setSteps(
        loadedTool?.steps?.map((step) => ({
          ...step,
        })) || [],
      );
      setOutputTransform(
        loadedTool.outputTransform ||
          `(sourceData) => {
        return {
          result: sourceData
        }
      }`,
      );

      setInstruction(loadedTool.instruction || "");
      setOutputSchema(
        loadedTool.outputSchema ? JSON.stringify(loadedTool.outputSchema, null, 2) : "",
      );

      setInputSchema(
        loadedTool.inputSchema ? JSON.stringify(loadedTool.inputSchema, null, 2) : null,
      );
      setResponseFilters(loadedTool.responseFilters || []);
    } catch (error: any) {
      console.error("Error loading tool:", error);
      toast({
        title: "Error loading tool",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTool && initialTool.id !== lastToolId) {
      setToolId(initialTool.id || "");
      setFolder(initialTool.folder);
      setIsArchived(initialTool.archived || false);
      setSteps(
        initialTool.steps?.map((step) => ({
          ...step,
        })) || [],
      );
      setOutputTransform(
        initialTool.outputTransform ||
          `(sourceData) => {
  return {
    result: sourceData
  }
}`,
      );
      const schemaString = initialTool.outputSchema
        ? JSON.stringify(initialTool.outputSchema, null, 2)
        : "";
      setOutputSchema(schemaString);
      setInputSchema(
        initialTool.inputSchema ? JSON.stringify(initialTool.inputSchema, null, 2) : null,
      );
      setInstruction(initialInstruction || initialTool.instruction || "");
      setResponseFilters(initialTool.responseFilters || []);
      setLastToolId(initialTool.id);
    }
  }, [
    initialTool,
    lastToolId,
    initialInstruction,
    setToolId,
    setSteps,
    setOutputTransform,
    setOutputSchema,
    setInputSchema,
    setInstruction,
    setFolder,
    setIsArchived,
    setResponseFilters,
  ]);

  useEffect(() => {
    if (!embedded && id) {
      loadTool(id);
    } else if (!embedded && !id && !initialTool) {
      setToolId("");
      setFolder(undefined);
      setIsArchived(false);
      setSteps([]);
      setInstruction("");
      setOutputTransform(`(sourceData) => {
  return {
    result: sourceData
  }
}`);
      setOutputSchema("");
      setInputSchema(null);
      setResponseFilters([]);
      setPayloadText("{}");
      clearAllExecutions();
    }
  }, [id, embedded, initialTool]);

  const saveTool = async (): Promise<boolean> => {
    try {
      try {
        JSON.parse(outputSchema || "{}");
      } catch (e) {
        throw new Error("Invalid response schema JSON");
      }
      try {
        JSON.parse(inputSchema || "{}");
      } catch (e) {
        throw new Error("Invalid input schema JSON");
      }

      const effectiveToolId = toolId.trim() || `wf-${Date.now()}`;
      if (!toolId.trim()) {
        setToolId(effectiveToolId);
      }
      setSaving(true);

      const stepsToSave = steps;

      const toolToSave: Tool = {
        id: effectiveToolId,
        steps: stepsToSave,
        outputSchema: outputSchema && outputSchema.trim() ? JSON.parse(outputSchema) : null,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        outputTransform,
        instruction: instructions,
        folder: folder ?? null,
        responseFilters: responseFilters.length > 0 ? responseFilters : undefined,
      } as any;

      if (embedded && onSave) {
        await onSave(toolToSave, computedPayload);
      } else {
        const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
        const savedTool = await client.upsertWorkflow(effectiveToolId, toolToSave as any);

        if (!savedTool) {
          throw new Error("Failed to save tool");
        }
        setToolId(savedTool.id);
        setOutputTransform(savedTool.outputTransform);
        setSteps(savedTool.steps);
      }

      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      return true;
    } catch (error: any) {
      if (error?.message === "cancelled") {
        return false;
      }
      console.error("Error saving tool:", error);
      toast({
        title: "Error saving tool",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    loading,
    saving,
    justSaved,
    loadTool,
    saveTool,
    setLoading,
  };
}

import JsonSchemaEditor from "@/src/components/editors/JsonSchemaEditor";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { formatBytes } from "@/src/lib/file-utils";
import { isEmptyData } from "@/src/lib/general-utils";
import { buildCategorizedSources } from "@/src/lib/templating-utils";
import { DownloadButton } from "@superglue/web/src/components/tools/shared/download-button";
import {
  Code2,
  FileBracesCorner,
  FileInput,
  FilePlay,
  Filter,
  Loader2,
  MessagesSquare,
  Play,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { JavaScriptCodeEditor } from "../../editors/JavaScriptCodeEditor";
import { JsonCodeEditor } from "../../editors/JsonCodeEditor";
import { useExecution, useToolConfig } from "../context";
import { useDataProcessor } from "../hooks/use-data-processor";
import { CopyButton } from "../shared/CopyButton";
import { ResponseFiltersCard } from "./ResponseFiltersCard";
import { useRightSidebar } from "../../sidebar/RightSidebarContext";

export interface TransformItem {
  type: "transform";
  data: { transform: string; responseSchema: string };
  stepResult: any;
  transformError: any;
  hasTransformCompleted: boolean;
  categorizedSources: ReturnType<typeof buildCategorizedSources>;
}

interface FinalTransformMiniStepCardProps {
  onExecuteTransform?: (schema: string, transform: string) => void;
  onAbort?: () => void;
}

export const FinalTransformMiniStepCard = ({
  onExecuteTransform,
  onAbort,
}: FinalTransformMiniStepCardProps) => {
  const {
    finalTransform,
    responseSchema,
    setFinalTransform,
    setResponseSchema,
    responseFilters,
    setResponseFilters,
    steps,
  } = useToolConfig();
  const {
    finalResult,
    finalError,
    getStepInput,
    isRunningTransform,
    isFixingTransform,
    canExecuteTransform,
    transformStatus,
  } = useExecution();
  const { sendMessageToAgent } = useRightSidebar();

  const transform = finalTransform;
  const transformResult = finalResult;
  const transformError = finalError;
  const canExecute = canExecuteTransform;
  const hasTransformCompleted = transformStatus === "completed";

  const stepInputs = getStepInput();
  const [activeTab, setActiveTab] = useState("transform");
  const [localTransform, setLocalTransform] = useState(transform || "");
  const [localSchema, setLocalSchema] = useState(responseSchema || "");
  const [inputViewMode, setInputViewMode] = useState<"preview" | "schema">("preview");
  const [outputViewMode, setOutputViewMode] = useState<"preview" | "schema">("preview");
  const [schemaInitialized, setSchemaInitialized] = useState(false);
  const [isPendingExecution, setIsPendingExecution] = useState(false);
  const isInternalChangeRef = useRef(false);

  useEffect(() => {
    if (!isInternalChangeRef.current) {
      setLocalTransform(transform || "");
    }
    isInternalChangeRef.current = false;
  }, [transform]);

  useEffect(() => {
    if (isRunningTransform || isFixingTransform) {
      setIsPendingExecution(false);
      setActiveTab("output");
    }
  }, [isRunningTransform, isFixingTransform]);

  useEffect(() => {
    if (!schemaInitialized) {
      setLocalSchema(responseSchema || "");
      setSchemaInitialized(true);
    }
  }, [responseSchema, schemaInitialized]);

  useEffect(() => {
    if (hasTransformCompleted) {
      setActiveTab("output");
    }
  }, [hasTransformCompleted]);

  // Reset to transform tab when status goes back to idle (e.g., when steps are invalidated)
  useEffect(() => {
    if (transformStatus === "idle") {
      setActiveTab("transform");
    }
  }, [transformStatus]);

  const inputProcessor = useDataProcessor(stepInputs, activeTab === "inputs");

  const outputProcessor = useDataProcessor(transformResult, activeTab === "output");

  // Re-trigger schema computation when data changes and we're viewing schema
  useEffect(() => {
    if (activeTab === "output" && outputViewMode === "schema" && transformResult) {
      outputProcessor.computeSchema();
    }
  }, [transformResult, outputViewMode, activeTab, outputProcessor]);

  useEffect(() => {
    if (activeTab === "inputs" && inputViewMode === "schema" && stepInputs) {
      inputProcessor.computeSchema();
    }
  }, [stepInputs, inputViewMode, activeTab, inputProcessor]);

  const inputData = {
    displayString:
      inputViewMode === "schema"
        ? inputProcessor.schema?.displayString || ""
        : inputProcessor.preview?.displayString || "",
    truncated:
      inputViewMode === "schema"
        ? inputProcessor.schema?.truncated || false
        : inputProcessor.preview?.truncated || false,
    bytes: inputProcessor.bytes,
  };

  const outputData = {
    displayString:
      outputViewMode === "schema"
        ? outputProcessor.schema?.displayString || ""
        : outputProcessor.preview?.displayString || "",
    truncated:
      outputViewMode === "schema"
        ? outputProcessor.schema?.truncated || false
        : outputProcessor.preview?.truncated || false,
    bytes: outputProcessor.bytes,
  };

  // Trigger schema computation when switching to schema view
  const handleInputViewModeChange = (mode: "preview" | "schema") => {
    setInputViewMode(mode);
    if (mode === "schema") {
      inputProcessor.computeSchema();
    }
  };

  const handleOutputViewModeChange = (mode: "preview" | "schema") => {
    setOutputViewMode(mode);
    if (mode === "schema") {
      outputProcessor.computeSchema();
    }
  };

  function handleTransformChange(value: string): void {
    isInternalChangeRef.current = true;
    setLocalTransform(value);
    setFinalTransform(value);
  }

  function handleSchemaChange(value: string | null): void {
    if (value === null || value === "") {
      setLocalSchema("");
      setResponseSchema("");
    } else {
      setLocalSchema(value);
      setResponseSchema(value);
    }
  }

  const handleAskAgentToFix = useCallback(() => {
    const truncatedError =
      transformError && transformError.length > 500
        ? `${transformError.slice(0, 500)}...`
        : transformError;
    sendMessageToAgent(
      `The transform failed with the following error:\n\n${truncatedError}\n\nPlease fix the transform code.`,
    );
  }, [transformError, sendMessageToAgent]);

  function handleExecuteTransform(): void {
    if (onExecuteTransform) {
      setIsPendingExecution(true);
      setActiveTab("output");
      onExecuteTransform(localSchema, localTransform);
    }
  }

  return (
    <Card className="w-full max-w-6xl mx-auto shadow-md border border-border/50 dark:border-border/70 overflow-hidden bg-gradient-to-br from-muted/30 to-muted/10 dark:from-muted/40 dark:to-muted/20 backdrop-blur-sm">
      <div className="p-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-3">
            <TabsList className="h-9 p-1 rounded-md">
              <TabsTrigger
                value="inputs"
                className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm"
              >
                <FileInput className="h-4 w-4" /> Step Input
              </TabsTrigger>
              <TabsTrigger
                value="transform"
                className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm"
              >
                <Code2 className="h-4 w-4" /> Transform Code
              </TabsTrigger>
              <TabsTrigger
                value="schema"
                className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm"
              >
                <FileBracesCorner className="h-4 w-4" /> Result Schema
              </TabsTrigger>
              <TabsTrigger
                value="filters"
                className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm"
              >
                <Filter className="h-4 w-4" /> Filters
              </TabsTrigger>
              <TabsTrigger
                value="output"
                className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm"
              >
                {isRunningTransform || isFixingTransform ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FilePlay className="h-4 w-4" />
                )}
                Result
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              {transformError && (
                <Button
                  variant="glass-primary"
                  onClick={handleAskAgentToFix}
                  className="h-8 px-3 gap-2 rounded-xl"
                >
                  <MessagesSquare className="h-3.5 w-3.5" />
                  <span className="font-medium text-[13px]">Fix in chat</span>
                </Button>
              )}
              {onExecuteTransform && (
                <>
                  <span
                    title={
                      !canExecute
                        ? "Execute all steps first"
                        : isRunningTransform
                          ? onAbort
                            ? "Stop transform"
                            : "Transform is running..."
                          : "Test final transform"
                    }
                  >
                    {isRunningTransform && onAbort ? (
                      <Button
                        variant="glass"
                        onClick={onAbort}
                        className="h-8 px-3 gap-2 rounded-xl"
                      >
                        <Square className="h-3 w-3" />
                        <span className="font-medium text-[13px]">Stop</span>
                      </Button>
                    ) : (
                      <Button
                        variant="glass"
                        onClick={handleExecuteTransform}
                        disabled={!canExecute || isRunningTransform || isFixingTransform}
                        className="h-8 px-3 gap-2 rounded-xl"
                      >
                        <Play className="h-3 w-3" />
                        <span className="font-medium text-[13px]">Run Transform</span>
                      </Button>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
          <TabsContent value="inputs" className="mt-0">
            {!canExecute ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                <div className="text-xs mb-1">No input yet</div>
                <p className="text-[10px]">Run all previous steps to see inputs</p>
              </div>
            ) : (
              <>
                <JsonCodeEditor
                  value={inputData.displayString}
                  readOnly={true}
                  minHeight="150px"
                  maxHeight="300px"
                  resizable={true}
                  overlay={
                    <div className="flex items-center gap-2">
                      {(inputProcessor.isComputingPreview || inputProcessor.isComputingSchema) && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      <Tabs
                        value={inputViewMode}
                        onValueChange={(v) => handleInputViewModeChange(v as "preview" | "schema")}
                        className="w-auto"
                      >
                        <TabsList className="h-6 rounded-md">
                          <TabsTrigger
                            value="preview"
                            className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md"
                          >
                            Preview
                          </TabsTrigger>
                          <TabsTrigger
                            value="schema"
                            className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md"
                          >
                            Schema
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <span className="text-[10px] text-muted-foreground">
                        {formatBytes(inputData.bytes)}
                      </span>
                      <CopyButton getData={() => stepInputs} />
                      <DownloadButton data={stepInputs} filename="transform_step_inputs.json" />
                    </div>
                  }
                />
                {inputData.truncated && inputViewMode === "preview" && (
                  <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                    Preview truncated for display performance
                  </div>
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="transform" className="mt-0">
            <JavaScriptCodeEditor
              value={localTransform}
              onChange={handleTransformChange}
              readOnly={false}
              minHeight="150px"
              maxHeight="300px"
              resizable={true}
              isTransformEditor={true}
            />
          </TabsContent>
          <TabsContent value="schema" className="mt-0">
            <div className="space-y-3">
              <JsonSchemaEditor
                value={localSchema || ""}
                onChange={handleSchemaChange}
                isOptional={true}
                showModeToggle={true}
              />
            </div>
          </TabsContent>
          <TabsContent value="filters" className="mt-0">
            <ResponseFiltersCard
              filters={responseFilters}
              onChange={setResponseFilters}
              disabled={isRunningTransform || isFixingTransform}
            />
          </TabsContent>
          <TabsContent value="output" className="mt-0">
            <>
              {isPendingExecution || isRunningTransform || isFixingTransform ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg">
                  <Loader2 className="h-8 w-8 mb-2 animate-spin" />
                  <p className="text-sm">
                    {isFixingTransform ? "Fixing transform..." : "Running transform..."}
                  </p>
                  <p className="text-xs mt-1">Please wait while the transform executes</p>
                </div>
              ) : transformError ? (
                <div className="flex flex-col items-start justify-start p-4 border rounded-lg bg-muted/30 border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                    <p className="text-sm font-semibold text-red-500 dark:text-red-400">
                      Transform Error
                    </p>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap font-mono w-full overflow-x-auto">
                    {transformError}
                  </pre>
                </div>
              ) : transformResult === undefined ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg">
                  <FilePlay className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No result yet</p>
                  <p className="text-xs mt-1">Run the tool or test the transform to see results</p>
                </div>
              ) : outputProcessor.isComputingPreview ? (
                <div className="flex items-center justify-center py-12 border rounded-lg">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <JsonCodeEditor
                    value={outputData.displayString}
                    readOnly
                    minHeight="150px"
                    maxHeight="300px"
                    resizable={true}
                    overlay={
                      <div className="flex items-center gap-2">
                        {outputProcessor.isComputingSchema && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        <Tabs
                          value={outputViewMode}
                          onValueChange={(v) =>
                            handleOutputViewModeChange(v as "preview" | "schema")
                          }
                          className="w-auto"
                        >
                          <TabsList className="h-6 rounded-md">
                            <TabsTrigger
                              value="preview"
                              className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md"
                            >
                              Preview
                            </TabsTrigger>
                            <TabsTrigger
                              value="schema"
                              className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md"
                            >
                              Schema
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <span className="text-[10px] text-muted-foreground">
                          {formatBytes(outputData.bytes)}
                        </span>
                        <CopyButton getData={() => transformResult} />
                        <DownloadButton data={transformResult} filename="tool_result.json" />
                      </div>
                    }
                  />
                  {isEmptyData(outputData.displayString) && (
                    <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      ⚠ No data returned. Is this expected?
                    </div>
                  )}
                  {outputData.truncated && outputViewMode === "preview" && (
                    <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                      Preview truncated for display performance. Use download button to get full
                      data.
                    </div>
                  )}
                </>
              )}
            </>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};

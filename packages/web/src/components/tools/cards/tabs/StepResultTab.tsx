import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Button } from "@/src/components/ui/button";
import { DownloadButton } from "../../shared/download-button";
import { isEmptyData } from "@/src/lib/general-utils";
import { formatBytes } from "@/src/lib/file-utils";
import { Loader2, OctagonX, X } from "lucide-react";
import { useCallback, useState } from "react";
import { JsonCodeEditor } from "../../../editors/JsonCodeEditor";
import { useDataProcessor } from "../../hooks/use-data-processor";
import { useExecution } from "../../context";
import { CopyButton } from "../../shared/CopyButton";
import { isAbortError } from "@/src/lib/general-utils";
import { useRightSidebar } from "../../../sidebar/RightSidebarContext";

interface StepResultTabProps {
  step: any;
  stepIndex: number;
  isExecuting?: boolean;
  isActive?: boolean;
}

export function StepResultTab({
  step,
  stepIndex,
  isExecuting,
  isActive = true,
}: StepResultTabProps) {
  const { getStepResult, isStepFailed, isStepAborted, isExecutingAny, currentExecutingStepIndex } =
    useExecution();
  const { sendMessageToAgent } = useRightSidebar();

  const stepResult = getStepResult(step.id);
  const stepFailed = isStepFailed(step.id);
  const stepAborted = isStepAborted(step.id);
  const [outputViewMode, setOutputViewMode] = useState<"preview" | "schema">("preview");

  const outputProcessor = useDataProcessor(stepResult, isActive);

  const handleOutputViewModeChange = (mode: "preview" | "schema") => {
    setOutputViewMode(mode);
    if (mode === "schema") {
      outputProcessor.computeSchema();
    }
  };

  const errorResult =
    (stepFailed || stepAborted) && (!stepResult || typeof stepResult === "string");
  const isPending = !stepFailed && !stepAborted && stepResult == null;
  const isActivelyRunning = !!(
    isExecuting ||
    (isExecutingAny && currentExecutingStepIndex === stepIndex)
  );

  let outputString = "";
  let isTruncated = false;

  if (!isPending) {
    if (errorResult) {
      if (stepResult) {
        outputString =
          stepResult.length > 50000
            ? stepResult.substring(0, 50000) + "\n... [Error message truncated]"
            : stepResult;
      } else {
        outputString = '{\n  "error": "Step execution failed"\n}';
      }
    } else {
      outputString =
        outputViewMode === "schema"
          ? outputProcessor.schema?.displayString || ""
          : outputProcessor.preview?.displayString || "";
      isTruncated =
        outputViewMode === "schema"
          ? outputProcessor.schema?.truncated || false
          : outputProcessor.preview?.truncated || false;
    }
  }

  const showEmptyWarning =
    !stepFailed &&
    !stepAborted &&
    !isPending &&
    !errorResult &&
    outputViewMode === "preview" &&
    isEmptyData(outputString || "");

  const aborted = stepAborted || (errorResult && isAbortError(stepResult));

  const handleAskAgentToFix = useCallback(() => {
    const errorMsg = typeof stepResult === "string" ? stepResult : "Step execution failed";
    const truncatedError = errorMsg.length > 500 ? `${errorMsg.slice(0, 500)}...` : errorMsg;
    sendMessageToAgent(
      `Step "${step.id}" failed with the following error:\n\n${truncatedError}\n\nPlease fix this step.`,
    );
  }, [step.id, stepResult, sendMessageToAgent]);

  return (
    <div>
      {errorResult ? (
        aborted ? (
          <div className="flex flex-col items-start justify-start p-4 border rounded-lg bg-muted/30 border-border">
            <div className="flex items-center gap-2 mb-2">
              <OctagonX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Execution Aborted
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Step execution was manually stopped. Run the step again to get results.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-start justify-start p-4 border rounded-lg bg-muted/30 border-border">
            <div className="flex items-center justify-between w-full mb-2">
              <div className="flex items-center gap-2">
                <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                <p className="text-sm font-semibold text-red-500 dark:text-red-400">Step Error</p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleAskAgentToFix}
                className="h-7 px-3 text-xs font-medium"
              >
                Fix in chat
              </Button>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono w-full overflow-x-auto">
              {outputString || "Step execution failed"}
            </pre>
          </div>
        )
      ) : isPending ? (
        isActivelyRunning ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <span className="text-xs">Currently running...</span>
            </div>
            <p className="text-[10px]">Step results will be shown shortly</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
            <div className="text-xs mb-1">No result yet</div>
            <p className="text-[10px]">Run this step to see results</p>
          </div>
        )
      ) : outputProcessor.isComputingPreview && !outputProcessor.preview?.displayString ? (
        <div className="flex items-center justify-center py-8 border rounded-md bg-muted/5">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <JsonCodeEditor
            value={outputString}
            readOnly={true}
            minHeight="300px"
            maxHeight="600px"
            resizable={true}
            overlay={
              <div className="flex items-center gap-2">
                {(outputProcessor.isComputingPreview || outputProcessor.isComputingSchema) && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Tabs
                  value={outputViewMode}
                  onValueChange={(v) => handleOutputViewModeChange(v as "preview" | "schema")}
                  className="w-auto"
                >
                  <TabsList className="h-6 p-0.5 rounded-md">
                    <TabsTrigger
                      value="preview"
                      className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm"
                    >
                      Preview
                    </TabsTrigger>
                    <TabsTrigger
                      value="schema"
                      className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm"
                    >
                      Schema
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <span className="text-[10px] text-muted-foreground">
                  {formatBytes(outputProcessor.bytes)}
                </span>
                <CopyButton getData={() => stepResult} />
                <DownloadButton data={stepResult} filename={`step_${step.id}_result.json`} />
              </div>
            }
          />
          {showEmptyWarning && (
            <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 px-2">
              ⚠ No data returned. Is this expected?
            </div>
          )}
          {isTruncated && outputViewMode === "preview" && (
            <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
              Preview truncated for display performance
            </div>
          )}
        </>
      )}
    </div>
  );
}

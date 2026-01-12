import { useMonacoTheme } from "@superglue/web/src/hooks/use-monaco-theme";
import { useResizable } from "@/src/hooks/use-resizable";
import { cn } from "@/src/lib/general-utils";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useMemo, useRef, useState } from "react";
import { TemplateChip } from "../../templates/TemplateChip";
import { useTemplatePreview } from "../../hooks/use-template-preview";
import { useDataProcessor } from "../../hooks/use-data-processor";
import { useToolConfig, useExecution } from "../../context";
import { CopyButton } from "../../shared/CopyButton";
import { DownloadButton } from "../../shared/download-button";
import { Loader2 } from "lucide-react";

const PLACEHOLDER_VALUE = "";
const CURRENT_ITEM_KEY = '"currentItem"';
const CHIP_LINE_NUMBER = 2;

interface ChipPosition {
  top: number;
  left: number;
}

interface StepInputTabProps {
  step: any;
  stepIndex: number;
  onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
  isActive?: boolean;
}

export function StepInputTab({ step, stepIndex, onEdit, isActive = true }: StepInputTabProps) {
  const { getStepConfig } = useToolConfig();
  const { canExecuteStep, sourceDataVersion, getStepInput, getStepTemplateData } = useExecution();
  const canExecute = canExecuteStep(stepIndex);
  const stepInput = getStepInput(step.id);
  const { sourceData } = getStepTemplateData(step.id);

  const { theme, onMount } = useMonacoTheme();
  const { height, resizeHandleProps } = useResizable({
    minHeight: 200,
    maxHeight: 800,
    initialHeight: 400,
  });

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chipPosition, setChipPosition] = useState<ChipPosition | null>(null);

  const currentItemExpression = step.loopSelector || "(sourceData) => sourceData";
  const cannotExecuteYet = stepIndex > 0 && !canExecute;
  const templateString = currentItemExpression.startsWith("<<")
    ? currentItemExpression
    : `<<${currentItemExpression}>>`;

  const { previewValue, previewError, isEvaluating, hasResult } = useTemplatePreview(
    currentItemExpression,
    sourceData,
    {
      enabled: isActive && canExecute && !!stepInput,
      debounceMs: 300,
      stepId: step.id,
      sourceDataVersion,
    },
  );

  const inputProcessor = useDataProcessor(stepInput, isActive);

  const displayData = useMemo(() => {
    if (!isActive || cannotExecuteYet) {
      return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE}\n}`;
    }
    const previewStr = inputProcessor.preview?.displayString || "{}";
    if (!previewStr.startsWith("{")) {
      return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE},\n  "sourceData": ${previewStr}\n}`;
    }
    const inner = previewStr.slice(1).trimStart();
    if (inner.length <= 1) {
      return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE}\n}`;
    }
    return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE},\n  ${inner.slice(0, -1)}\n}`;
  }, [isActive, cannotExecuteYet, inputProcessor.preview?.displayString]);

  const computeChipPosition = useCallback((): ChipPosition | null => {
    const editor = editorRef.current;
    if (!editor || !containerRef.current) return null;

    const model = editor.getModel();
    if (!model) return null;

    const lineContent = model.getLineContent(CHIP_LINE_NUMBER);
    const colonIndex = lineContent.indexOf(":");
    if (colonIndex < 0) return null;

    const coords = editor.getScrolledVisiblePosition({
      lineNumber: CHIP_LINE_NUMBER,
      column: colonIndex + 2,
    });
    const editorHeight = parseInt(height);

    if (!coords || coords.top < -10 || coords.top >= editorHeight - 10) {
      return null;
    }
    return { top: coords.top, left: coords.left + 2 };
  }, [height]);

  const updateChipPosition = useCallback(() => {
    setChipPosition(computeChipPosition());
  }, [computeChipPosition]);

  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      onMount(editor);
      setTimeout(updateChipPosition, 50);
      editor.onDidScrollChange(() => requestAnimationFrame(updateChipPosition));
      editor.onDidLayoutChange(() => requestAnimationFrame(updateChipPosition));
    },
    [onMount, updateChipPosition],
  );

  const handleUpdate = useCallback(
    (newTemplate: string) => {
      const expression = newTemplate.replace(/^<<|>>$/g, "");
      const latestStep = getStepConfig(step.id);
      if (latestStep) {
        onEdit?.(step.id, { ...latestStep, loopSelector: expression }, true);
      }
    },
    [onEdit, step.id, getStepConfig],
  );

  return (
    <div>
      <div className={cn("relative rounded-lg border shadow-sm bg-muted/30")} ref={containerRef}>
        {cannotExecuteYet && (
          <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none bg-muted/5 backdrop-blur-[2px]">
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <div className="text-xs mb-1">No data yet</div>
              <p className="text-[10px]">Data selector will evaluate after previous step runs</p>
            </div>
          </div>
        )}

        <div className="absolute top-1 right-1 z-10 mr-5 flex items-center gap-1">
          {(isEvaluating || inputProcessor.isComputingPreview) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <CopyButton text={displayData} />
          <DownloadButton data={stepInput} filename="step_input.json" />
        </div>

        <div {...resizeHandleProps} />

        <div className={cn("overflow-hidden relative cursor-not-allowed")} style={{ height }}>
          {chipPosition && (
            <div
              className="absolute z-20 bg-muted rounded-sm flex items-center"
              style={{
                top: chipPosition.top,
                left: chipPosition.left,
                height: "18px",
                pointerEvents: "auto",
              }}
            >
              <TemplateChip
                template={templateString}
                evaluatedValue={previewValue}
                error={previewError ?? undefined}
                hasResult={hasResult}
                isEvaluating={isEvaluating}
                onUpdate={handleUpdate}
                onDelete={() => {}}
                stepId={step.id}
                loopMode={true}
                hideDelete={true}
                inline={true}
                popoverTitle="Data Selector"
                popoverHelpText="Returns an array → step loops over items. Returns an object → step runs once. currentItem is either the object returned or the current array item."
              />
            </div>
          )}
          <Editor
            height="100%"
            defaultLanguage="json"
            value={displayData}
            onMount={handleEditorMount}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: "off",
              glyphMargin: false,
              folding: true,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 0,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              contextmenu: false,
              renderLineHighlight: "none",
              scrollbar: {
                vertical: "auto",
                horizontal: "auto",
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
                alwaysConsumeMouseWheel: false,
              },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              padding: { top: 12, bottom: 12 },
              quickSuggestions: false,
              parameterHints: { enabled: false },
              codeLens: false,
              links: false,
              colorDecorators: false,
              occurrencesHighlight: "off",
              renderValidationDecorations: "off",
              stickyScroll: { enabled: false },
              automaticLayout: true,
            }}
            theme={theme}
            className="bg-transparent"
          />
        </div>
      </div>
    </div>
  );
}

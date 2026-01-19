import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { useMonacoTheme } from "@superglue/web/src/hooks/use-monaco-theme";
import {
  DEFAULT_CODE_TEMPLATE,
  formatValueForDisplay,
  normalizeTemplateExpression,
} from "@/src/lib/templating-utils";
import Editor from "@monaco-editor/react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { isArrowFunction, maskCredentials } from "@superglue/shared";
import { AlertCircle, CirclePause, CirclePlay, Loader2, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import { DownloadButton } from "../shared/download-button";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTemplatePreview } from "../hooks/use-template-preview";
import { CopyButton } from "../shared/CopyButton";
import { useExecution } from "../context/tool-execution-context";
import { format as prettierFormat } from "prettier/standalone";
import prettierBabel from "prettier/plugins/babel";
import prettierEstree from "prettier/plugins/estree";

const TEMPLATE_POPOVER_OPEN_EVENT = "template-popover-open";
const TEMPLATE_POPOVER_CLOSE_ALL_EVENT = "template-popover-close-all";

const POPOVER_Z_INDEX = 200;
const POPOVER_WIDTH_PX = 700;
const MODAL_WIDTH_PX = 900;
const LINE_HEIGHT_PX = 19;
const EDITOR_PADDING_PX = 16;
const MIN_EDITOR_HEIGHT_PX = 40;
const DEFAULT_CODE_HEIGHT_PX = 80;
const MAX_CODE_HEIGHT_VH = 0.2;
const MAX_PREVIEW_HEIGHT_VH = 0.15;
const MODAL_CODE_HEIGHT_VH = 0.45;
const MODAL_PREVIEW_HEIGHT_VH = 0.35;
const CHARS_PER_LINE_ESTIMATE = 100;

const MONACO_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: "on",
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  scrollBeyondLastLine: false,
  wordWrap: "on",
  contextmenu: false,
  renderLineHighlight: "none",
  scrollbar: {
    vertical: "auto",
    horizontal: "hidden",
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  padding: { top: 8, bottom: 8 },
  quickSuggestions: false,
  parameterHints: { enabled: false },
  codeLens: false,
  automaticLayout: true,
  stickyScroll: { enabled: false },
};

const calcHeight = (content: string, maxHeight: number): number => {
  const lines = (content || "").split("\n");
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE_ESTIMATE));
  }
  return Math.min(
    maxHeight,
    Math.max(MIN_EDITOR_HEIGHT_PX, totalLines * LINE_HEIGHT_PX + EDITOR_PADDING_PX),
  );
};

interface TemplateEditPopoverProps {
  template: string;
  onSave: (newTemplate: string) => void;
  stepId: string;
  children?: React.ReactNode;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  anchorRect?: { left: number; top: number; } | (() => { left: number; top: number; } | null) | null;
  loopMode?: boolean;
  title?: string;
  helpText?: string;
}

export function TemplateEditPopover({
  template,
  onSave,
  stepId,
  children,
  externalOpen,
  onExternalOpenChange,
  onOpenChange,
  anchorRect,
  loopMode = false,
  title = "Template Expression",
  helpText,
}: TemplateEditPopoverProps) {
  const { getStepTemplateData, sourceDataVersion } = useExecution();
  const { sourceData, credentials, canExecute } = getStepTemplateData(stepId);

  const [internalOpen, setInternalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const isDraggingRef = useRef(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const popoverId = useId();

  const setOpen = useCallback(
    (newOpen: boolean) => {
      if (isControlled) {
        onExternalOpenChange?.(newOpen);
      } else {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
      if (!newOpen) {
        setIsFullscreen(false);
      }
      if (newOpen) {
        window.dispatchEvent(new CustomEvent(TEMPLATE_POPOVER_OPEN_EVENT, { detail: popoverId }));
      }
    },
    [isControlled, onExternalOpenChange, onOpenChange, popoverId],
  );

  useEffect(() => {
    const handleOtherOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== popoverId) setOpen(false);
    };
    const handleCloseAll = () => setOpen(false);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        window.dispatchEvent(new CustomEvent(TEMPLATE_POPOVER_CLOSE_ALL_EVENT));
      }
    };

    window.addEventListener(TEMPLATE_POPOVER_OPEN_EVENT, handleOtherOpen);
    window.addEventListener(TEMPLATE_POPOVER_CLOSE_ALL_EVENT, handleCloseAll);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(TEMPLATE_POPOVER_OPEN_EVENT, handleOtherOpen);
      window.removeEventListener(TEMPLATE_POPOVER_CLOSE_ALL_EVENT, handleCloseAll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [setOpen, popoverId]);

  const templateContent = template.replace(/^<<|>>$/g, "");
  const { theme, onMount } = useMonacoTheme();

  const [codeContent, setCodeContent] = useState(DEFAULT_CODE_TEMPLATE);
  const [previewTab, setPreviewTab] = useState<"expression" | "currentItem">("currentItem");
  const [codeEditorHeight, setCodeEditorHeight] = useState(DEFAULT_CODE_HEIGHT_PX);
  const codeEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [autoPreview, setAutoPreview] = useState(canExecute);
  const [manualPreviewVersion, setManualPreviewVersion] = useState(0);
  const [manualPreviewCode, setManualPreviewCode] = useState(codeContent);

  // Default to manual mode when step inputs become unavailable
  useEffect(() => {
    if (!canExecute) {
      setAutoPreview(false);
    }
  }, [canExecute]);

  const effectivePreviewCode = autoPreview ? codeContent : manualPreviewCode;
  const shouldRunPreview = open && (autoPreview || manualPreviewVersion > 0);
  const { previewValue, previewError, isEvaluating, hasResult } = useTemplatePreview(
    effectivePreviewCode,
    sourceData ?? {},
    { enabled: shouldRunPreview, stepId, sourceDataVersion: autoPreview ? sourceDataVersion : manualPreviewVersion },
  );

  const handleRunPreview = useCallback(() => {
    setManualPreviewCode(codeContent);
    setManualPreviewVersion((v) => v + 1);
  }, [codeContent]);

  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      codeEditorRef.current = editor;
      onMount(editor);
      setTimeout(() => {
        editor.setScrollPosition({ scrollTop: 0 });
      }, 100);
    },
    [onMount],
  );

  useEffect(() => {
    if (open) {
      let initialCode = DEFAULT_CODE_TEMPLATE;
      if (templateContent) {
        try {
          initialCode = normalizeTemplateExpression(templateContent);
        } catch {
          initialCode = templateContent;
        }
      }

      (async () => {
        try {
          const formatted = await prettierFormat(initialCode, {
            parser: "babel",
            plugins: [prettierBabel, prettierEstree],
            printWidth: 80,
            semi: true,
            singleQuote: false,
          });
          initialCode = formatted.trim();
        } catch {
          // keep unformatted if Prettier fails
        }
        setCodeContent(initialCode);
        const maxCodeHeight = window.innerHeight * MAX_CODE_HEIGHT_VH;
        const calculatedHeight = calcHeight(initialCode, maxCodeHeight);
        setCodeEditorHeight(Math.max(DEFAULT_CODE_HEIGHT_PX, calculatedHeight));
        setTimeout(() => {
          codeEditorRef.current?.setScrollPosition({ scrollTop: 0 });
        }, 50);
      })();
    }
  }, [open, templateContent]);

  const handleSave = () => {
    const newTemplate = `<<${codeContent}>>`;
    onSave(newTemplate);
    setOpen(false);
  };

  const isLoopArray = loopMode && Array.isArray(previewValue) && previewValue.length > 0;
  const currentItemValue = isLoopArray ? previewValue[0] : previewValue;
  const activePreviewValue =
    loopMode && previewTab === "currentItem" ? currentItemValue : previewValue;

  const isLoading = shouldRunPreview && (isEvaluating || !hasResult);
  const showNoDataHint = !canExecute && !hasResult;
  const previewDisplayRaw = isLoading ? "" : showNoDataHint ? "// No step input data available yet" : formatValueForDisplay(activePreviewValue);
  const previewDisplay = maskCredentials(previewDisplayRaw, credentials);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const [, forceUpdate] = useState(0);
  const resolvedAnchorRect = typeof anchorRect === "function" ? anchorRect() : anchorRect;

  useEffect(() => {
    if (resolvedAnchorRect && resolvedAnchorRect.left <= 0 && resolvedAnchorRect.top <= 0 && open) {
      setOpen(false);
    }
  }, [resolvedAnchorRect, open, setOpen]);

  useEffect(() => {
    if (!open || typeof anchorRect !== "function") return;
    const handleScroll = () => forceUpdate((n) => n + 1);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open, anchorRect]);

  const maxPreviewHeightVh = isFullscreen ? MODAL_PREVIEW_HEIGHT_VH : MAX_PREVIEW_HEIGHT_VH;
  const maxPreviewHeight = window.innerHeight * maxPreviewHeightVh;
  const previewEditorHeight = calcHeight(previewDisplay, maxPreviewHeight);
  const effectiveCodeHeight = isFullscreen
    ? Math.max(codeEditorHeight, window.innerHeight * MODAL_CODE_HEIGHT_VH)
    : codeEditorHeight;
  const effectivePreviewHeight = isFullscreen
    ? Math.max(previewEditorHeight, window.innerHeight * MODAL_PREVIEW_HEIGHT_VH)
    : previewEditorHeight;

  const codeEditorSection = (showHeader = true) => (
    <div className={isFullscreen ? "flex flex-col min-w-0 h-full" : ""}>
      {showHeader && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">{title}</Label>
            {helpText && <HelpTooltip text={helpText} />}
          </div>
          {!isFullscreen && (
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-7 px-2 flex items-center gap-1.5 rounded border border-border bg-muted/50 hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
              title="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Expand</span>
            </button>
          )}
        </div>
      )}
      <div
        className="rounded-md border overflow-hidden relative flex-1"
        style={{ height: isFullscreen ? undefined : effectiveCodeHeight }}
      >
        <Editor
          height={isFullscreen ? "100%" : effectiveCodeHeight}
          defaultLanguage="javascript"
          value={codeContent}
          onChange={(val) => setCodeContent(val || "")}
          onMount={handleEditorMount}
          options={MONACO_OPTIONS}
          theme={theme}
        />
        <div className="absolute top-1 right-1 z-10">
          <CopyButton getData={() => codeContent} />
        </div>
      </div>
      {codeContent && !isArrowFunction(codeContent) && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400 px-1 pt-1 flex items-center gap-1">
          <span>⚠</span>
          <span>
            Code will be auto-wrapped with (sourceData) =&gt; {"{"} ... {"}"} when executed
          </span>
        </div>
      )}
    </div>
  );

  const previewSection = (
    <div className={isFullscreen ? "flex flex-col min-w-0 h-full" : ""}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <Label className="text-xs text-muted-foreground">Preview</Label>
        <div className="flex items-center gap-2">
          {isFullscreen && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRunPreview}
                className="h-6 px-2 flex items-center gap-1 rounded border border-border bg-primary/10 hover:bg-primary/20 transition-colors text-[10px] text-primary"
                title="Run preview"
              >
                <Play className="h-3 w-3" />
                <span>Run</span>
              </button>
              <button
                type="button"
                onClick={() => setAutoPreview(!autoPreview)}
                className={`h-6 px-2 flex items-center gap-1 rounded border transition-colors text-[10px] "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"`}
                title={autoPreview ? "Preview updates on every keystroke (click to switch to manual)" : "Preview only updates when you click Run (click to enable auto-refresh)"}
              >
                {autoPreview ? <CirclePlay className="h-3 w-3" /> : <CirclePause className="h-3 w-3" />}
                <span>{autoPreview ? "Auto Refresh" : "Manual Refresh"}</span>
              </button>
            </div>
          )}
          {isLoopArray && (
            <Tabs
              value={previewTab}
              onValueChange={(v) => setPreviewTab(v as "expression" | "currentItem")}
              className="w-auto"
            >
              <TabsList className="h-6 p-0.5 rounded-md">
                <TabsTrigger
                  value="currentItem"
                  className="h-full px-2 text-[10px] rounded-sm data-[state=active]:rounded-sm"
                >
                  Current Item
                </TabsTrigger>
                <TabsTrigger
                  value="expression"
                  className="h-full px-2 text-[10px] rounded-sm data-[state=active]:rounded-sm"
                >
                  Iteration Items
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>
      {!canExecute && (
        <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-600 dark:text-amber-400 mb-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Step inputs not available yet - preview may show errors</span>
        </div>
      )}
      {previewError ? (
        <div
          className="p-3 bg-destructive/10 rounded-md text-xs text-destructive overflow-auto flex-1"
          style={{ height: isFullscreen ? undefined : effectivePreviewHeight }}
        >
          {previewError}
        </div>
      ) : (
        <div
            className="relative rounded-md border bg-muted/30 overflow-hidden transition-[height] duration-150 flex-1"
            style={{ height: isFullscreen ? undefined : effectivePreviewHeight }}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <Editor
            height={isFullscreen ? "100%" : effectivePreviewHeight}
            defaultLanguage="json"
            value={previewDisplay}
            onMount={onMount}
            options={{ ...MONACO_OPTIONS, readOnly: true, fontSize: 11 }}
            theme={theme}
          />
          <div className="absolute top-1 right-1 flex items-center gap-0.5 z-10">
            <CopyButton getData={() => previewDisplay} />
            <DownloadButton
              data={activePreviewValue}
              filename="template-result.json"
              credentials={credentials}
            />
          </div>
        </div>
      )}
    </div>
  );

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const container = (e.target as HTMLElement).parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newRatio = (moveEvent.clientX - containerRect.left) / containerRect.width;
      setSplitRatio(Math.max(0.2, Math.min(0.8, newRatio)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const footerSection = (
    <div className="flex justify-end gap-2 pt-1">
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!codeContent}
        className="h-8 text-xs"
      >
        Save
      </Button>
    </div>
  );

  const popoverContent = isFullscreen ? (
    <div className="flex flex-col h-full">
      {/* Header with minimize button */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b">
        <div className="flex items-center gap-1">
          <Label className="text-sm font-medium">{title}</Label>
          {helpText && <HelpTooltip text={helpText} />}
        </div>
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          className="h-7 px-2 flex items-center gap-1.5 rounded border border-border bg-muted/50 hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
          title="Exit fullscreen"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          <span>Collapse</span>
        </button>
      </div>
      {/* Split panes */}
      <div className="flex flex-1 min-h-0 gap-0">
        <div style={{ width: `${splitRatio * 100}%` }} className="flex flex-col min-w-0 pr-2">
          {codeEditorSection(false)}
        </div>
        {/* Draggable splitter */}
        <div
          className="w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors flex-shrink-0 rounded"
          onMouseDown={handleSplitterMouseDown}
        />
        <div style={{ width: `${(1 - splitRatio) * 100}%` }} className="flex flex-col min-w-0 pl-2">
          {previewSection}
        </div>
      </div>
      {footerSection}
    </div>
  ) : (
    <div className="space-y-4">
      {codeEditorSection(true)}
      {previewSection}
      {footerSection}
    </div>
  );

  const popoverProps = {
    className: "p-4",
    align: "start" as const,
    side: "bottom" as const,
    sideOffset: 4,
    avoidCollisions: true,
    collisionPadding: 24,
    sticky: "always" as const,
    style: {
      width: POPOVER_WIDTH_PX,
      maxWidth: "90vw",
      maxHeight: "70vh",
      overflowY: "auto" as const,
      zIndex: POPOVER_Z_INDEX,
    },
    onOpenAutoFocus: (e: Event) => e.preventDefault(),
    onInteractOutside: (e: Event) => e.preventDefault(),
    onPointerDownOutside: (e: Event) => e.preventDefault(),
    onEscapeKeyDown: (e: Event) => e.preventDefault(),
  };

  if (isFullscreen && open) {
    return (
      <>
        {children && (
          <Popover open={false}>
            <PopoverTrigger asChild onClick={() => setOpen(true)}>
              {children}
            </PopoverTrigger>
          </Popover>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="p-6 max-w-none border border-border/60"
            style={{
              width: "calc(100vw - 48px)",
              height: "calc(100vh - 48px)",
              maxWidth: "none",
              maxHeight: "none",
              overflowY: "auto",
              zIndex: POPOVER_Z_INDEX,
            }}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <VisuallyHidden>
              <DialogTitle>Edit Template Expression</DialogTitle>
            </VisuallyHidden>
            {popoverContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (resolvedAnchorRect) {
    if (resolvedAnchorRect.left <= 0 && resolvedAnchorRect.top <= 0) {
      return null;
    }
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverAnchor asChild>
          <span
            style={{
              position: "fixed",
              left: resolvedAnchorRect.left,
              top: resolvedAnchorRect.top,
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        </PopoverAnchor>
        <PopoverContent {...popoverProps}>{popoverContent}</PopoverContent>
      </Popover>
    );
  }

  if (children) {
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent {...popoverProps}>{popoverContent}</PopoverContent>
      </Popover>
    );
  }

  return null;
}

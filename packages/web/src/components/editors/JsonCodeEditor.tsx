import { useMonacoTheme } from "@superglue/web/src/hooks/use-monaco-theme";
import { useResizable } from "@/src/hooks/use-resizable";
import { cn } from "@/src/lib/general-utils";
import Editor from "@monaco-editor/react";
import React, { useMemo, useState } from "react";
import { CopyButton } from "../tools/shared/CopyButton";

const HIGHLIGHTING_THRESHOLD = 500 * 1024; // 500KB

type JsonCodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  height?: string;
  resizeHandleProps?: {
    className: string;
    style: React.CSSProperties;
    onMouseDown: (e: React.MouseEvent) => void;
  };
  placeholder?: string;
  overlay?: React.ReactNode;
  bottomRightOverlay?: React.ReactNode;
  overlayPlacement?: "default" | "corner";
  resizable?: boolean;
  showValidation?: boolean;
  noBorder?: boolean;
};

export const JsonCodeEditor = ({
  value,
  onChange,
  readOnly = false,
  minHeight = "150px",
  maxHeight,
  height,
  resizeHandleProps,
  placeholder = "{}",
  overlay,
  bottomRightOverlay,
  overlayPlacement = "default",
  resizable = false,
  showValidation = false,
  noBorder = false,
}: JsonCodeEditorProps) => {
  const { theme, onMount } = useMonacoTheme();

  // Calculate content-based height when no explicit height/maxHeight is set
  const contentHeight = useMemo(() => {
    const content = value || placeholder;
    const lineCount = (content.match(/\n/g) || []).length + 1;
    const lineHeight = 18; // approximate line height in Monaco
    const padding = 24; // top + bottom padding
    return Math.max(parseInt(minHeight), lineCount * lineHeight + padding);
  }, [value, placeholder, minHeight]);

  const { height: resizableHeight, resizeHandleProps: internalResizeHandleProps } = useResizable({
    minHeight: 100,
    maxHeight: 1000,
    initialHeight: maxHeight ? parseInt(maxHeight) : 300,
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  const displayValue = useMemo(() => {
    const base = value || placeholder;
    if (readOnly && (base?.length || 0) > HIGHLIGHTING_THRESHOLD)
      return `${base.slice(0, HIGHLIGHTING_THRESHOLD)}\n...truncated...`;
    return base;
  }, [value, placeholder, readOnly]);

  // Use content-based height, capped by maxHeight if set
  const effectiveHeight = useMemo(() => {
    if (height) return height;
    if (resizable) return resizableHeight;
    if (!maxHeight) return contentHeight;

    // Parse maxHeight - only works reliably with px values
    const parsed = parseInt(maxHeight, 10);
    if (isNaN(parsed)) return contentHeight;
    return Math.min(contentHeight, parsed);
  }, [height, resizable, resizableHeight, maxHeight, contentHeight]);
  const effectiveResizeHandleProps =
    resizeHandleProps ?? (resizable ? internalResizeHandleProps : null);

  return (
    <div className={cn("relative", !noBorder && "rounded-lg border shadow-sm bg-muted/30")}>
      {overlay && (
        <div
          className={cn(
            "absolute z-10 flex items-center gap-1",
            overlayPlacement === "corner" ? "top-2 right-2" : "top-1 right-1 mr-5",
          )}
        >
          {overlay}
        </div>
      )}
      {bottomRightOverlay && (
        <div
          className={cn(
            "absolute z-10 flex items-center gap-1",
            overlayPlacement === "corner" ? "bottom-2 right-2" : "bottom-1 right-1 mr-5",
          )}
        >
          {bottomRightOverlay}
        </div>
      )}
      {!overlay && (
        <div
          className={cn(
            "absolute z-10",
            overlayPlacement === "corner" ? "top-2 right-2" : "top-1 right-1 mr-5",
          )}
        >
          <CopyButton text={value || placeholder} />
        </div>
      )}
      {effectiveResizeHandleProps && <div {...effectiveResizeHandleProps} />}
      <div
        className={cn("overflow-hidden px-3", readOnly ? "cursor-not-allowed" : "cursor-text")}
        style={{ height: effectiveHeight }}
      >
        <Editor
          height={effectiveHeight}
          defaultLanguage="json"
          value={displayValue}
          onChange={(newValue) => {
            const val = newValue || "";
            onChange?.(val);

            if (showValidation) {
              try {
                if (val && val.trim()) {
                  JSON.parse(val);
                  setJsonError(null);
                } else {
                  setJsonError(null);
                }
              } catch (e) {
                setJsonError((e as Error).message);
              }
            }
          }}
          onMount={onMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "off",
            glyphMargin: false,
            folding: false,
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
            unicodeHighlight: {
              ambiguousCharacters: false,
              invisibleCharacters: false,
              nonBasicASCII: false,
            },
          }}
          theme={theme}
          className="bg-transparent"
        />
      </div>
      {showValidation && jsonError && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-destructive/10 text-destructive text-xs max-h-32 overflow-y-auto overflow-x-hidden">
          Error: {jsonError}
        </div>
      )}
    </div>
  );
};

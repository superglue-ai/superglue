import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { useMonacoTheme } from "@superglue/web/src/hooks/use-monaco-theme";
import { useResizable } from "@/src/hooks/use-resizable";
import { formatJavaScriptCode } from "@/src/lib/general-utils";
import Editor from "@monaco-editor/react";
import { isArrowFunction } from "@superglue/shared";
import React, { useEffect, useState } from "react";
import { CopyButton } from "../tools/shared/CopyButton";

export const JavaScriptCodeEditor = React.memo(
  ({
    value,
    onChange,
    readOnly = false,
    minHeight = "200px",
    maxHeight = "350px",
    showCopy = true,
    resizable = false,
    isTransformEditor = false,
    autoFormatOnMount = true,
  }: {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    showCopy?: boolean;
    resizable?: boolean;
    isTransformEditor?: boolean;
    autoFormatOnMount?: boolean;
  }) => {
    const { theme, onMount } = useMonacoTheme();
    const { height: resizableHeight, resizeHandleProps } = useResizable({
      minHeight: 150,
      maxHeight: 600,
      initialHeight: parseInt(maxHeight),
    });
    const effectiveHeight = resizable ? resizableHeight : maxHeight;
    const [hasFormatted, setHasFormatted] = useState(false);
    const hasValidPattern = (code: string): boolean => isArrowFunction(code);
    const displayValue = value || "";

    useEffect(() => {
      if (!autoFormatOnMount) return;
      if (!onChange || hasFormatted || !displayValue.trim()) return;
      formatJavaScriptCode(displayValue).then((formatted) => {
        if (formatted !== displayValue) {
          onChange(formatted);
        }
        setHasFormatted(true);
      });
    }, []);

    const handleChange = (newValue: string | undefined) => {
      if (!onChange || newValue === undefined) return;
      onChange(newValue);
    };

    return (
      <div className="relative bg-muted/30 rounded-lg border font-mono shadow-sm js-code-editor">
        {(showCopy || isTransformEditor) && (
          <div className="absolute top-1 right-1 z-10 flex items-center gap-1 mr-5">
            {isTransformEditor && (
              <HelpTooltip text="The transform must be an arrow function (sourceData) => { ... } that receives step results and returns the final output. Access each step's data via sourceData.stepId." />
            )}
            {showCopy && <CopyButton text={value || ""} />}
          </div>
        )}
        {resizable && <div {...resizeHandleProps} />}
        {isTransformEditor && displayValue && !hasValidPattern(displayValue) && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 px-3 pt-2 flex items-center gap-1">
            <span>⚠</span>
            <span>
              Code needs to be a valid arrow function (sourceData) =&gt; {"{"} ... {"}"}
            </span>
          </div>
        )}
        <div className="overflow-hidden pr-3" style={{ height: effectiveHeight }}>
          <Editor
            height={effectiveHeight}
            defaultLanguage="javascript"
            value={displayValue}
            onChange={handleChange}
            onMount={onMount}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 11,
              lineNumbers: "on",
              glyphMargin: false,
              folding: true,
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
              padding: { top: 12, bottom: 12 },
              lineHeight: 18,
              tabSize: 2,
              quickSuggestions: false,
              codeLens: false,
              links: false,
              colorDecorators: false,
              occurrencesHighlight: "off",
              stickyScroll: { enabled: false },
            }}
            theme={theme}
            className="!bg-transparent"
          />
        </div>
      </div>
    );
  },
);

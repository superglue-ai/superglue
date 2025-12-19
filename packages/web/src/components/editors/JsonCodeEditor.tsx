import { useMonacoTheme } from '@superglue/web/src/hooks/use-monaco-theme';
import { useResizable } from '@/src/hooks/use-resizable';
import { cn } from '@/src/lib/general-utils';
import Editor from '@monaco-editor/react';
import React, { useMemo, useState } from 'react';
import { CopyButton } from '../tools/shared/CopyButton';

const HIGHLIGHTING_THRESHOLD = 100 * 1024; // 100KB

type JsonCodeEditorProps = {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    placeholder?: string;
    overlay?: React.ReactNode;
    bottomRightOverlay?: React.ReactNode;
    resizable?: boolean;
    showValidation?: boolean;
}

export const JsonCodeEditor = (
    { 
        value,
        onChange,
        readOnly = false,
        minHeight = '150px',
        maxHeight = '300px',
        placeholder = '{}',
        overlay,
        bottomRightOverlay,
        resizable = false,
        showValidation = false }: 
    JsonCodeEditorProps) => {
    const { theme, onMount } = useMonacoTheme();
    const { height: resizableHeight, resizeHandleProps } = useResizable({ 
        minHeight: 60, 
        maxHeight: 600, 
        initialHeight: parseInt(maxHeight) 
    });
    const [jsonError, setJsonError] = useState<string | null>(null);
    
    const displayValue = useMemo(() => {
        const base = value || placeholder;
        if (readOnly && (base?.length || 0) > HIGHLIGHTING_THRESHOLD) return `${base.slice(0, HIGHLIGHTING_THRESHOLD)}\n...truncated...`;
        return base;
    }, [value, placeholder, readOnly]);

    const effectiveHeight = resizable ? resizableHeight : maxHeight;
    
    return (
        <div className={cn("relative rounded-lg border shadow-sm bg-muted/30")}>
            {overlay && (<div className="absolute top-1 right-1 z-10 mr-5 flex items-center gap-1">{overlay}</div>)}
            {bottomRightOverlay && (<div className="absolute bottom-1 right-1 z-10 mr-5 flex items-center gap-1">{bottomRightOverlay}</div>)}
            {!overlay && (<div className="absolute top-1 right-1 z-10 mr-5"><CopyButton text={value || placeholder} /></div>)}
            {resizable && <div {...resizeHandleProps} />}
            <div className={cn("overflow-hidden px-3", readOnly ? "cursor-not-allowed" : "cursor-text")} style={{ height: effectiveHeight }}>
                <Editor
                    height={effectiveHeight}
                    defaultLanguage="json"
                    value={displayValue}
                    onChange={(newValue) => {
                        const val = newValue || '';
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
                        lineNumbers: 'off',
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        contextmenu: false,
                        renderLineHighlight: 'none',
                        scrollbar: {
                            vertical: 'auto',
                            horizontal: 'auto',
                            verticalScrollbarSize: 8,
                            horizontalScrollbarSize: 8,
                            alwaysConsumeMouseWheel: false
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
                        occurrencesHighlight: 'off',
                        renderValidationDecorations: 'off',
                        stickyScroll: { enabled: false }
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

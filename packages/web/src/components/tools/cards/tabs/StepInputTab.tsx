import { useMonacoTheme } from '@/src/hooks/useMonacoTheme';
import { cn } from '@/src/lib/general-utils';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TemplateChip } from '../../templates/TemplateChip';
import { useTemplatePreview } from '../../hooks/use-template-preview';
import { CopyButton } from '../../shared/CopyButton';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '../../../ui/button';
import { downloadJson } from '@/src/lib/download-utils';
import { Label } from '../../../ui/label';
import { HelpTooltip } from '../../../utils/HelpTooltip';

const PLACEHOLDER_VALUE = '';
const CURRENT_ITEM_KEY = '"currentItem"';

interface StepInputTabProps {
    step: any;
    stepIndex: number;
    evolvingPayload: any;
    canExecute: boolean;
    readOnly?: boolean;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
}

export function StepInputTab({
    step,
    stepIndex,
    evolvingPayload,
    canExecute,
    readOnly = false,
    onEdit,
}: StepInputTabProps) {
    const { theme, onMount } = useMonacoTheme();
    const [currentHeight, setCurrentHeight] = useState('400px');
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [chipPosition, setChipPosition] = useState<{ top: number; left: number } | null>(null);

    const currentItemExpression = step.loopSelector || '(sourceData) => sourceData';
    const cannotExecuteYet = stepIndex > 0 && !canExecute;

    const templateString = currentItemExpression.startsWith('<<') 
        ? currentItemExpression 
        : `<<${currentItemExpression}>>`;

    const { previewValue, previewError, isEvaluating, hasResult } = useTemplatePreview(
        currentItemExpression,
        evolvingPayload,
        { enabled: canExecute && !!evolvingPayload, debounceMs: 300 }
    );

    const dataWithCurrentItem = useMemo(() => {
        const currentItem = previewError 
            ? `[Error: ${previewError}]` 
            : previewValue;
        return { currentItem, ...evolvingPayload };
    }, [evolvingPayload, previewValue, previewError]);

    const displayData = useMemo(() => {
        try {
            const dataStr = JSON.stringify(evolvingPayload, null, 2);
            if (dataStr.startsWith('{')) {
                const inner = dataStr.slice(1).trimStart();
                if (inner.length <= 1) {
                    return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE}\n}`;
                }
                return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE},\n  ${inner.slice(0, -1)}\n}`;
            }
            return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE},\n  "sourceData": ${dataStr}\n}`;
        } catch {
            return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE}\n}`;
        }
    }, [evolvingPayload]);

    const updateChipPosition = useCallback(() => {
        const editor = editorRef.current;
        if (!editor || !containerRef.current) return;

        const model = editor.getModel();
        if (!model) return;

        const line2 = model.getLineContent(2);
        const colonIndex = line2.indexOf(':');
        if (colonIndex < 0) return;

        const position = { lineNumber: 2, column: colonIndex + 2 };
        const coords = editor.getScrolledVisiblePosition(position);
        const editorHeight = parseInt(currentHeight);
        
        if (coords && coords.top >= -10 && coords.top < editorHeight - 10) {
            setChipPosition({ 
                top: coords.top,
                left: coords.left + 2
            });
        } else {
            setChipPosition(null);
        }
    }, [currentHeight]);

    const handleEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
        editorRef.current = editor;
        onMount(editor);
        setTimeout(updateChipPosition, 50);
        editor.onDidScrollChange(updateChipPosition);
        editor.onDidLayoutChange(updateChipPosition);
    }, [onMount, updateChipPosition]);

    const handleUpdate = (newTemplate: string) => {
        const expression = newTemplate.replace(/^<<|>>$/g, '');
        if (onEdit) {
            onEdit(step.id, { ...step, loopSelector: expression }, true);
        }
    };

    if (cannotExecuteYet) {
        return (
            <div className="flex flex-col items-center justify-center border rounded-md bg-muted/5 text-muted-foreground" style={{ height: '400px' }}>
                <div className="text-xs mb-1">No input yet</div>
                <p className="text-[10px]">Run previous step to see inputs</p>
            </div>
        );
    }

    return (
        <div>
            <Label className="text-xs flex items-center gap-1 mb-1">
                Step Input Data
                <HelpTooltip text="Aggregated data from the tool payload and previous step results. Edit the currentItem expression to control what data this step receives for each iteration." />
            </Label>
            <div className={cn("relative rounded-lg border shadow-sm bg-muted/30")} ref={containerRef}>
                <div className="absolute top-1 right-1 z-10 mr-5 flex items-center gap-1">
                    {isEvaluating && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <CopyButton text={JSON.stringify(dataWithCurrentItem, null, 2)} />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => downloadJson(dataWithCurrentItem, 'step_input.json')}
                        title="Download step input as JSON"
                    >
                        <Download className="h-3 w-3" />
                    </Button>
                </div>
                
                <div className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-10" 
                    style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.3) 50%)' }} 
                    onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startHeight = parseInt(currentHeight);
                        const handleMouseMove = (e: MouseEvent) => { 
                            const deltaY = e.clientY - startY; 
                            const newHeight = Math.max(200, Math.min(800, startHeight + deltaY)); 
                            setCurrentHeight(`${newHeight}px`); 
                        };
                        const handleMouseUp = () => { 
                            document.removeEventListener('mousemove', handleMouseMove); 
                            document.removeEventListener('mouseup', handleMouseUp); 
                        };
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                    }} 
                />

                <div className={cn("overflow-hidden relative", "cursor-not-allowed")} style={{ height: currentHeight }}>
                    {chipPosition && (
                        <div 
                            className="absolute z-20 bg-muted rounded-sm flex items-center"
                            style={{ 
                                top: chipPosition.top, 
                                left: chipPosition.left,
                                height: '18px',
                                pointerEvents: 'auto'
                            }}
                        >
                            <TemplateChip
                                template={templateString}
                                evaluatedValue={previewValue}
                                error={previewError ?? undefined}
                                stepData={evolvingPayload}
                                hasResult={hasResult}
                                canExecute={canExecute}
                                onUpdate={handleUpdate}
                                onDelete={() => {}}
                                readOnly={readOnly}
                                loopMode={true}
                                hideDelete={true}
                                inline={true}
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
                            lineNumbers: 'off',
                            glyphMargin: false,
                            folding: true,
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
            </div>
        </div>
    );
}


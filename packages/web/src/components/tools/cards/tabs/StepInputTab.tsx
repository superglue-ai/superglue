import { useMonacoTheme } from '@superglue/web/src/hooks/use-monaco-theme';
import { cn } from '@/src/lib/general-utils';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useCallback, useMemo, useRef, useState } from 'react';
import { TemplateChip } from '../../templates/TemplateChip';
import { TemplateContextProvider } from '../../templates/tiptap/TemplateContext';
import { useTemplatePreview } from '../../hooks/use-template-preview';
import { useDataProcessor } from '../../hooks/use-data-processor';
import { useExecution } from '../../context';
import { CopyButton } from '../../shared/CopyButton';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '../../../ui/button';
import { downloadJson } from '@/src/lib/download-utils';

const PLACEHOLDER_VALUE = '';
const CURRENT_ITEM_KEY = '"currentItem"';

interface StepInputTabProps {
    step: any;
    stepIndex: number;
    evolvingPayload: any;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    isActive?: boolean;
}

export function StepInputTab({
    step,
    stepIndex,
    evolvingPayload,
    onEdit,
    isActive = true,
}: StepInputTabProps) {
    const { sourceDataVersion, canExecuteStep } = useExecution();
    const canExecute = canExecuteStep(stepIndex);
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
        { enabled: isActive && canExecute && !!evolvingPayload, debounceMs: 300, sourceDataVersion, stepId: step.id }
    );

    const inputProcessor = useDataProcessor(evolvingPayload, isActive);

    const displayData = useMemo(() => {
        if (!isActive) return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE}\n}`;
        if (cannotExecuteYet) {
            return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE}\n}`;
        }
        const previewStr = inputProcessor.preview?.displayString || '{}';
        if (previewStr.startsWith('{')) {
            const inner = previewStr.slice(1).trimStart();
            if (inner.length <= 1) {
                return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE}\n}`;
            }
            return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE},\n  ${inner.slice(0, -1)}\n}`;
        }
        return `{\n  ${CURRENT_ITEM_KEY}: ${PLACEHOLDER_VALUE},\n  "sourceData": ${previewStr}\n}`;
    }, [isActive, cannotExecuteYet, inputProcessor.preview?.displayString]);

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
        editor.onDidScrollChange(() => requestAnimationFrame(updateChipPosition));
        editor.onDidLayoutChange(() => requestAnimationFrame(updateChipPosition));
    }, [onMount, updateChipPosition]);

    const handleUpdate = (newTemplate: string) => {
        const expression = newTemplate.replace(/^<<|>>$/g, '');
        if (onEdit) {
            onEdit(step.id, { ...step, loopSelector: expression }, true);
        }
    };

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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => downloadJson(evolvingPayload, 'step_input.json')}
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
                        <TemplateContextProvider stepData={evolvingPayload} canExecute={canExecute} sourceDataVersion={sourceDataVersion} stepId={step.id}>
                        <TemplateChip
                            template={templateString}
                            evaluatedValue={previewValue}
                            error={previewError ?? undefined}
                            stepData={evolvingPayload}
                            hasResult={hasResult}
                            canExecute={canExecute}
                            isEvaluating={isEvaluating}
                            onUpdate={handleUpdate}
                            onDelete={() => {}}
                            loopMode={true}
                            hideDelete={true}
                            inline={true}
                            popoverTitle="Data Selector"
                            popoverHelpText="Returns an array → step loops over items. Returns an object → step runs once. currentItem is either the object returned or the current array item."
                        />
                        </TemplateContextProvider>
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
                            stickyScroll: { enabled: false },
                            automaticLayout: true
                        }}
                        theme={theme}
                        className="bg-transparent"
                    />
                </div>
            </div>
        </div>
    );
}

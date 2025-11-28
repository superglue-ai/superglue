import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import History from '@tiptap/extension-history';
import HardBreak from '@tiptap/extension-hard-break';
import { cn } from '@/src/lib/general-utils';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { TemplateExtension } from '../tools/templates/TemplateExtension';
import { TemplateContextProvider, useTemplateContext, type CategorizedVariables, type CategorizedSources } from '../tools/templates/TemplateContext';
import { VariableSuggestion, createVariableSuggestionConfig } from '../tools/templates/TemplateVariableSuggestion';
import { TemplateEditPopover } from '../tools/templates/TemplateEditPopover';
import { multilineTemplateStringToTiptap, multilineTiptapToTemplateString } from '../tools/templates/tiptap/serialization';
import { CopyButton } from '../tools/shared/CopyButton';
import { evaluateTemplate, parseTemplateString } from '@/src/lib/template-utils';
import { maskCredentials } from '@superglue/shared';

interface TemplateAwareJsonEditorProps {
    value: string;
    onChange?: (value: string) => void;
    stepData: any;
    loopData?: any;
    canExecute?: boolean;
    categorizedVariables?: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    placeholder?: string;
    resizable?: boolean;
    showValidation?: boolean;
}

function TemplateAwareJsonEditorInner({
    value,
    onChange,
    readOnly = false,
    minHeight = '100px',
    maxHeight = '150px',
    placeholder = '{}',
    resizable = false,
    showValidation = false,
    stepData,
    loopData,
    canExecute = true,
}: TemplateAwareJsonEditorProps) {
    const isUpdatingRef = useRef(false);
    const lastValueRef = useRef(value);
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const [jsonError, setJsonError] = useState<string | null>(null);
    const { categorizedVariables, categorizedSources } = useTemplateContext();
    
    const credentials = useMemo(() => {
        if (!stepData || typeof stepData !== 'object') return {};
        return Object.entries(stepData).reduce((acc, [key, value]) => {
            const pattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*_[a-zA-Z0-9_$]+$/;
            if (pattern.test(key) && typeof value === 'string' && value.length > 0) {
                acc[key] = value;
            }
            return acc;
        }, {} as Record<string, string>);
    }, [stepData]);
    
    const [codePopoverOpen, setCodePopoverOpen] = useState(false);
    const [popoverAnchorRect, setPopoverAnchorRect] = useState<{ left: number; top: number } | null>(null);
    const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
    const suggestionDestroyRef = useRef<(() => void) | null>(null);

    const suggestionConfig = useMemo(() => createVariableSuggestionConfig({
        categorizedVariables,
        categorizedSources,
        onSelectVariable: (varName, range, categoryKey) => {
            // All variables are code expressions now
            const templateExpr = `(sourceData) => sourceData.${varName}`;
            editorRef.current?.chain().focus()
                .deleteRange(range)
                .insertContent({
                    type: 'template',
                    attrs: { rawTemplate: `<<${templateExpr}>>` },
                })
                .run();
        },
        onSelectCode: (range, cursorCoords) => {
            // Get coordinates BEFORE deleting the @
            const view = editorRef.current?.view;
            let anchor = cursorCoords;
            if (view) {
                const coords = view.coordsAtPos(range.from);
                anchor = { left: coords.left, top: coords.bottom };
            }
            editorRef.current?.chain().focus().deleteRange(range).run();
            setPopoverAnchorRect(anchor);
            setCodePopoverOpen(true);
        },
        onEscape: (range) => {
            editorRef.current?.chain().focus()
                .deleteRange(range)
                .insertContent('@')
                .run();
        },
        onOpen: (destroy) => {
            suggestionDestroyRef.current = destroy;
        },
        onClose: () => {
            suggestionDestroyRef.current = null;
        },
    }), [categorizedVariables, categorizedSources]);

    useEffect(() => {
        return () => {
            if (suggestionDestroyRef.current) {
                suggestionDestroyRef.current();
            }
        };
    }, []);

    const editor = useEditor({
        extensions: [
            Document,
            Paragraph,
            Text,
            History,
            HardBreak,
            TemplateExtension,
            VariableSuggestion.configure({
                suggestion: suggestionConfig,
            }),
        ],
        content: multilineTemplateStringToTiptap(value),
        editable: !readOnly,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    'w-full h-full px-3 py-2 text-xs font-mono bg-transparent',
                    'focus:outline-none',
                    'overflow-auto',
                    readOnly && 'cursor-not-allowed'
                ),
            },
        },
        onUpdate: ({ editor }) => {
            if (isUpdatingRef.current) return;
            
            const json = editor.getJSON();
            const newValue = multilineTiptapToTemplateString(json);
            
            if (newValue !== lastValueRef.current) {
                lastValueRef.current = newValue;
                onChange?.(newValue);
            }
        },
    });

    useEffect(() => {
        editorRef.current = editor;
    }, [editor]);

    useEffect(() => {
        console.log('[TemplateAwareJsonEditor] codePopoverOpen changed to:', codePopoverOpen, 'anchorRect:', popoverAnchorRect);
    }, [codePopoverOpen, popoverAnchorRect]);

    const handleCodeSave = useCallback((template: string) => {
        console.log('[TemplateAwareJsonEditor] handleCodeSave called with:', template);
        if (editor) {
            editor.chain().focus()
                .insertContent({
                    type: 'template',
                    attrs: { rawTemplate: template },
                })
                .run();
        }
        setCodePopoverOpen(false);
        setPopoverAnchorRect(null);
    }, [editor]);

    useEffect(() => {
        if (!editor || value === lastValueRef.current) return;
        
        isUpdatingRef.current = true;
        lastValueRef.current = value;
        
        const newContent = multilineTemplateStringToTiptap(value);
        setTimeout(() => {
            editor.commands.setContent(newContent);
            isUpdatingRef.current = false;
        }, 0);
    }, [editor, value]);

    useEffect(() => {
        if (editor) {
            editor.setEditable(!readOnly);
        }
    }, [editor, readOnly]);

    useEffect(() => {
        if (!showValidation) {
            setJsonError(null);
            return;
        }

        const validateJson = async () => {
            if (!value || !value.trim()) {
                setJsonError(null);
                return;
            }

            const parts = parseTemplateString(value);
            let evaluatedValue = value;

            for (const part of parts) {
                if (part.type === 'template' && part.rawTemplate) {
                    if (canExecute) {
                        try {
                            const expression = part.rawTemplate.replace(/^<<|>>$/g, '').trim();
                            const result = await evaluateTemplate(expression, stepData, loopData);
                            if (result.success && result.value !== undefined) {
                                const replacement = typeof result.value === 'string' 
                                    ? result.value
                                    : JSON.stringify(result.value);
                                evaluatedValue = evaluatedValue.replace(part.rawTemplate, replacement);
                            } else {
                                evaluatedValue = evaluatedValue.replace(part.rawTemplate, '__PLACEHOLDER__');
                            }
                        } catch {
                            evaluatedValue = evaluatedValue.replace(part.rawTemplate, '__PLACEHOLDER__');
                        }
                    } else {
                        evaluatedValue = evaluatedValue.replace(part.rawTemplate, '__PLACEHOLDER__');
                    }
                }
            }

            try {
                JSON.parse(evaluatedValue);
                setJsonError(null);
            } catch (e) {
                setJsonError((e as Error).message);
            }
        };

        const timer = setTimeout(validateJson, 300);
        return () => clearTimeout(timer);
    }, [showValidation, value, stepData, loopData, canExecute]);

    return (
        <div className={cn('relative rounded-lg border shadow-sm bg-muted/30')}>
            <div className="absolute top-1 right-1 z-10 mr-1">
                <CopyButton text={value || placeholder} />
            </div>
            {resizable && (
                <div 
                    className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-10" 
                    style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.3) 50%)' }} 
                    onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startHeight = parseInt(currentHeight);
                        const handleMouseMove = (e: MouseEvent) => { 
                            const deltaY = e.clientY - startY; 
                            const newHeight = Math.max(60, Math.min(600, startHeight + deltaY)); 
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
            )}
            <div 
                className={cn('relative', readOnly ? 'cursor-not-allowed' : 'cursor-text')}
                style={{ 
                    height: resizable ? currentHeight : maxHeight,
                    minHeight: minHeight,
                    overflow: 'hidden',
                }}
            >
                <EditorContent 
                    editor={editor} 
                    className="h-full"
                />
                {editor && editor.isEmpty && placeholder && (
                    <div className="absolute top-2 left-3 text-xs pointer-events-none font-mono json-placeholder-bracket">
                        {placeholder}
                    </div>
                )}
            {showValidation && jsonError && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-destructive/10 text-destructive text-xs max-h-24 overflow-y-auto border-t">
                        Error: {credentials && Object.keys(credentials).length > 0 ? maskCredentials(jsonError, credentials) : jsonError}
                </div>
            )}
            </div>
            <TemplateEditPopover
                template=""
                stepData={stepData}
                loopData={loopData}
                onSave={handleCodeSave}
                externalOpen={codePopoverOpen}
                onExternalOpenChange={setCodePopoverOpen}
                anchorRect={popoverAnchorRect}
                canExecute={canExecute}
            />
        </div>
    );
}

export function TemplateAwareJsonEditor(props: TemplateAwareJsonEditorProps) {
    return (
        <TemplateContextProvider 
            stepData={props.stepData} 
            loopData={props.loopData} 
            readOnly={props.readOnly}
            canExecute={props.canExecute}
            categorizedVariables={props.categorizedVariables}
            categorizedSources={props.categorizedSources}
        >
            <TemplateAwareJsonEditorInner {...props} />
        </TemplateContextProvider>
    );
}


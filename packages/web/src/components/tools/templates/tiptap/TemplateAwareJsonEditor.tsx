import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import History from '@tiptap/extension-history';
import HardBreak from '@tiptap/extension-hard-break';
import { cn } from '@/src/lib/general-utils';
import { useEffect, useRef, useState, useMemo } from 'react';
import { TemplateExtension } from './TemplateExtension';
import { TemplateContextProvider } from './TemplateContext';
import { multilineTemplateStringToTiptap, multilineTiptapToTemplateString } from './serialization';
import { CopyButton } from '../../shared/CopyButton';
import { evaluateTemplate, prepareSourceData, parseTemplateString } from '@/src/lib/template-utils';

interface TemplateAwareJsonEditorProps {
    value: string;
    onChange?: (value: string) => void;
    stepData: any;
    loopData?: any;
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
}: TemplateAwareJsonEditorProps) {
    const isUpdatingRef = useRef(false);
    const lastValueRef = useRef(value);
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const [jsonError, setJsonError] = useState<string | null>(null);

    const editor = useEditor({
        extensions: [
            Document,
            Paragraph,
            Text,
            History,
            HardBreak,
            TemplateExtension,
        ],
        content: multilineTemplateStringToTiptap(value),
        editable: !readOnly,
        immediatelyRender: false, // Prevent SSR hydration mismatch
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

    // Sync external value changes to editor
    useEffect(() => {
        if (!editor || value === lastValueRef.current) return;
        
        isUpdatingRef.current = true;
        lastValueRef.current = value;
        
        const newContent = multilineTemplateStringToTiptap(value);
        editor.commands.setContent(newContent);
        
        isUpdatingRef.current = false;
    }, [editor, value]);

    // Update editable state
    useEffect(() => {
        if (editor) {
            editor.setEditable(!readOnly);
        }
    }, [editor, readOnly]);

    // JSON validation on evaluated string
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

            // Evaluate templates first
            const parts = parseTemplateString(value);
            let evaluatedValue = value;

            for (const part of parts) {
                if (part.type === 'template' && part.rawTemplate) {
                    try {
                        // Strip <<>> markers for evaluation
                        const expression = part.rawTemplate.replace(/^<<|>>$/g, '').trim();
                        const result = await evaluateTemplate(expression, stepData, loopData);
                        if (result.success && result.value !== undefined) {
                            const replacement = typeof result.value === 'string' 
                                ? `"${result.value}"` 
                                : JSON.stringify(result.value);
                            evaluatedValue = evaluatedValue.replace(part.rawTemplate, replacement);
                        }
                    } catch {
                        // Keep original template if evaluation fails
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
    }, [showValidation, value, stepData, loopData]);

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
                    <div className="absolute top-2 left-3 text-muted-foreground text-xs pointer-events-none font-mono">
                        {placeholder}
                    </div>
                )}
            </div>
            {showValidation && jsonError && (
                <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs max-h-24 overflow-y-auto border-t">
                    Error: {jsonError}
                </div>
            )}
        </div>
    );
}

export function TemplateAwareJsonEditor(props: TemplateAwareJsonEditorProps) {
    return (
        <TemplateContextProvider 
            stepData={props.stepData} 
            loopData={props.loopData} 
            readOnly={props.readOnly}
        >
            <TemplateAwareJsonEditorInner {...props} />
        </TemplateContextProvider>
    );
}


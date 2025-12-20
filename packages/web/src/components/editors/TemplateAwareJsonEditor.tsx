import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import History from '@tiptap/extension-history';
import HardBreak from '@tiptap/extension-hard-break';
import { cn } from '@/src/lib/general-utils';
import { useEffect, useRef, useState, useMemo } from 'react';
import { TemplateExtension, TemplateContextProvider, useTemplateContext, type CategorizedVariables, type CategorizedSources } from '../tools/templates/tiptap';
import { VariableSuggestion } from '../tools/templates/TemplateVariableSuggestion';
import { TemplateEditPopover } from '../tools/templates/TemplateEditPopover';
import { templateStringToTiptap, tiptapToTemplateString } from '../tools/templates/tiptap/serialization';
import { CopyButton } from '../tools/shared/CopyButton';
import { evaluateTemplate, parseTemplateString, prepareSourceData } from '@/src/lib/templating-utils';
import { maskCredentials } from '@superglue/shared';
import { useTemplateAwareEditor } from '../tools/hooks/use-template-aware-editor';
import { useResizable } from '@/src/hooks/use-resizable';

interface TemplateAwareJsonEditorProps {
    value: string;
    onChange?: (value: string) => void;
    stepData: any;
    dataSelectorOutput?: any;
    canExecute?: boolean;
    categorizedVariables?: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    placeholder?: string;
    resizable?: boolean;
    showValidation?: boolean;
    stepId?: string;
}

function TemplateAwareJsonEditorInner({
    value,
    onChange,
    readOnly = false,
    minHeight = '75px',
    maxHeight = '300px',
    placeholder = '{}',
    resizable = false,
    showValidation = false,
    stepData,
    dataSelectorOutput,
    canExecute = true,
}: TemplateAwareJsonEditorProps) {
    const isUpdatingRef = useRef(false);
    const lastValueRef = useRef(value);
    const { height: resizableHeight, resizeHandleProps } = useResizable({ 
        minHeight: parseInt(minHeight), 
        maxHeight: parseInt(maxHeight), 
        initialHeight: parseInt(minHeight) 
    });
    const [jsonError, setJsonError] = useState<string | null>(null);
    const { categorizedVariables, categorizedSources } = useTemplateContext();
    
    const {
        sourceData,
        suggestionConfig,
        codePopoverOpen,
        setCodePopoverOpen,
        popoverAnchorRect,
        handleCodeSave,
        editorRef,
        cleanupSuggestion,
    } = useTemplateAwareEditor({ stepData, dataSelectorOutput, categorizedVariables, categorizedSources });
    
    const credentials = useMemo(() => {
        if (!sourceData || typeof sourceData !== 'object') return {};
            const pattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*_[a-zA-Z0-9_$]+$/;
        return Object.entries(sourceData).reduce((acc, [key, val]) => {
            if (pattern.test(key) && typeof val === 'string' && val.length > 0) {
                acc[key] = val;
            }
            return acc;
        }, {} as Record<string, string>);
    }, [sourceData]);

    useEffect(() => cleanupSuggestion, [cleanupSuggestion]);

    const editor = useEditor({
        extensions: [
            Document,
            Paragraph,
            Text,
            History,
            HardBreak,
            TemplateExtension,
            VariableSuggestion.configure({ suggestion: suggestionConfig }),
        ],
        content: templateStringToTiptap(value),
        editable: !readOnly,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    'w-full px-3 py-2 text-xs font-mono bg-transparent',
                    'focus:outline-none',
                    readOnly && 'cursor-not-allowed'
                ),
            },
        },
        onUpdate: ({ editor }) => {
            if (isUpdatingRef.current) return;
            const newValue = tiptapToTemplateString(editor.getJSON());
            if (newValue !== lastValueRef.current) {
                lastValueRef.current = newValue;
                onChange?.(newValue);
            }
        },
    });

    useEffect(() => { editorRef.current = editor; }, [editor, editorRef]);

    useEffect(() => {
        if (!editor || value === lastValueRef.current) return;
        isUpdatingRef.current = true;
        lastValueRef.current = value;
        // Defer to microtask to avoid flushSync during React render
        queueMicrotask(() => {
            editor.commands.setContent(templateStringToTiptap(value));
            isUpdatingRef.current = false;
        });
    }, [editor, value]);

    useEffect(() => { editor?.setEditable(!readOnly); }, [editor, readOnly]);

    useEffect(() => {
        if (!showValidation || !value?.trim()) {
            setJsonError(null);
            return;
        }

        let cancelled = false;
        const sourceData = prepareSourceData(stepData, dataSelectorOutput);

        const escapeForJson = (str: string) => 
            str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

        const toJsonValue = (val: unknown, isInsideQuotes: boolean): string => {
            if (typeof val === 'string') {
                return isInsideQuotes ? escapeForJson(val) : val;
            }
            return JSON.stringify(val);
        };

        const validateJson = async () => {
            let json = value;

            for (const part of parseTemplateString(value)) {
                if (cancelled) return;
                if (part.type !== 'template' || !part.rawTemplate) continue;

                const expression = part.rawTemplate.slice(2, -2).trim();
                const result = canExecute 
                    ? await evaluateTemplate(expression, sourceData).catch(() => null) 
                    : null;

                if (cancelled) return;

                const evaluated = result?.success ? result.value : null;
                const insertPos = json.indexOf(part.rawTemplate);
                const isInsideQuotes = insertPos > 0 && json[insertPos - 1] === '"';

                json = json.replace(part.rawTemplate, toJsonValue(evaluated, isInsideQuotes));
            }

            if (cancelled) return;

            try {
                JSON.parse(json);
                setJsonError(null);
            } catch (e) {
                setJsonError((e as Error).message);
            }
        };

        const timer = setTimeout(validateJson, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [showValidation, value, stepData, dataSelectorOutput, canExecute]);


    return (
        <div className={cn('relative rounded-lg border shadow-sm bg-muted/30')}>
            <div className="absolute top-1 right-1 z-10 mr-1">
                <CopyButton text={value || placeholder} />
            </div>
            {resizable && <div {...resizeHandleProps} />}
            <div 
                className={cn('relative', readOnly ? 'cursor-not-allowed' : 'cursor-text')}
                style={{ 
                    height: resizable ? resizableHeight : 'auto', 
                    minHeight, 
                    maxHeight,
                    overflow: 'auto' 
                }}
            >
                <EditorContent 
                    editor={editor} 
                    className={cn(
                        resizable ? "h-full" : "",
                        jsonError && "pb-10"
                    )}
                />
                {!value?.trim() && placeholder && (
                    <div className="absolute top-2 left-3 text-xs pointer-events-none font-mono json-placeholder-bracket">
                        {placeholder}
                    </div>
                )}
            </div>
            {showValidation && jsonError && (
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-destructive/10 text-destructive text-xs max-h-24 overflow-y-auto border-t z-10">
                        Error: {Object.keys(credentials).length > 0 ? maskCredentials(jsonError, credentials) : jsonError}
                </div>
            )}
            <TemplateEditPopover
                template=""
                sourceData={sourceData}
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
            dataSelectorOutput={props.dataSelectorOutput} 
            readOnly={props.readOnly}
            canExecute={props.canExecute}
            categorizedVariables={props.categorizedVariables}
            categorizedSources={props.categorizedSources}
            stepId={props.stepId}
        >
            <TemplateAwareJsonEditorInner {...props} />
        </TemplateContextProvider>
    );
}

import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import History from '@tiptap/extension-history';
import { cn } from '@/src/lib/general-utils';
import { useEffect, useRef, useCallback } from 'react';
import { TemplateExtension, TemplateContextProvider, useTemplateContext, type CategorizedVariables, type CategorizedSources } from '../tools/templates/tiptap';
import { VariableSuggestion } from '../tools/templates/TemplateVariableSuggestion';
import { TemplateEditPopover } from '../tools/templates/TemplateEditPopover';
import { templateStringToTiptap, tiptapToTemplateString } from '../tools/templates/tiptap/serialization';
import { useTemplateAwareEditor } from '../tools/hooks/use-template-aware-editor';

interface TemplateAwareTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    stepData: any;
    dataSelectorOutput?: any;
    canExecute?: boolean;
    categorizedVariables?: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    stepId?: string;
    sourceDataVersion?: number;
}

const SingleLineDocument = Document.extend({ content: 'paragraph' });

const DEBOUNCE_MS = 200;

function TemplateAwareTextEditorInner({
    value,
    onChange,
    placeholder,
    className,
    disabled = false,
    stepData,
    dataSelectorOutput,
    canExecute = true,
}: Omit<TemplateAwareTextEditorProps, 'categorizedVariables' | 'categorizedSources'>) {
    const isUpdatingRef = useRef(false);
    const lastValueRef = useRef(value);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { categorizedVariables, categorizedSources } = useTemplateContext();

    const debouncedOnChange = useCallback((newValue: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onChange(newValue), DEBOUNCE_MS);
    }, [onChange]);

    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
    
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

    useEffect(() => cleanupSuggestion, [cleanupSuggestion]);

    const editor = useEditor({
        extensions: [
            SingleLineDocument,
            Paragraph,
            Text,
            History,
            TemplateExtension,
            VariableSuggestion.configure({ suggestion: suggestionConfig }),
        ],
        content: templateStringToTiptap(value),
        editable: !disabled,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    'w-full h-9 px-3 py-2 text-xs font-mono rounded-lg border bg-muted/30 shadow-sm',
                    'focus:outline-none overflow-x-auto overflow-y-hidden whitespace-nowrap',
                    disabled && 'opacity-50 cursor-not-allowed'
                ),
                style: 'min-height: 36px; line-height: 20px;',
            },
        },
        onUpdate: ({ editor }) => {
            if (isUpdatingRef.current) return;
            const newValue = tiptapToTemplateString(editor.getJSON());
            if (newValue !== lastValueRef.current) {
                lastValueRef.current = newValue;
                debouncedOnChange(newValue);
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

    useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

    return (
        <div className={cn('relative flex-1', className)}>
            <EditorContent editor={editor} className="[&_.tiptap]:outline-none [&_.tiptap]:w-full" />
            {!value?.trim() && placeholder && (
                <div className="absolute top-2 left-3 text-muted-foreground text-xs pointer-events-none font-mono">
                    {placeholder}
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

export function TemplateAwareTextEditor({
    value,
    onChange,
    stepData,
    dataSelectorOutput,
    canExecute = true,
    categorizedVariables,
    categorizedSources,
    placeholder,
    className,
    disabled = false,
    stepId,
    sourceDataVersion = 0,
}: TemplateAwareTextEditorProps) {
    return (
        <TemplateContextProvider 
            stepData={stepData} 
            dataSelectorOutput={dataSelectorOutput} 
            readOnly={disabled} 
            canExecute={canExecute} 
            categorizedVariables={categorizedVariables}
            categorizedSources={categorizedSources}
            stepId={stepId}
            sourceDataVersion={sourceDataVersion}
        >
            <TemplateAwareTextEditorInner
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={className}
                disabled={disabled}
                stepData={stepData}
                dataSelectorOutput={dataSelectorOutput}
                canExecute={canExecute}
            />
        </TemplateContextProvider>
    );
}

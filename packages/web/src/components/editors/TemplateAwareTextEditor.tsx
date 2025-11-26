import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import History from '@tiptap/extension-history';
import { cn } from '@/src/lib/general-utils';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { TemplateExtension } from '../tools/templates/TemplateExtension';
import { TemplateContextProvider, useTemplateContext } from '../tools/templates/TemplateContext';
import { VariableSuggestion, createVariableSuggestionConfig } from '../tools/templates/VariableSuggestion';
import { TemplateEditPopover } from '../tools/templates/TemplateEditPopover';
import { templateStringToTiptap, tiptapToTemplateString } from '../tools/templates/tiptap/serialization';

interface TemplateAwareTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    stepData: any;
    loopData?: any;
    canExecute?: boolean;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

const SingleLineDocument = Document.extend({
    content: 'paragraph',
});

function TemplateAwareTextEditorInner({
    value,
    onChange,
    placeholder,
    className,
    disabled = false,
    stepData,
    loopData,
    canExecute = true,
}: Omit<TemplateAwareTextEditorProps, 'stepData' | 'loopData'> & { stepData: any; loopData?: any; canExecute?: boolean }) {
    const isUpdatingRef = useRef(false);
    const lastValueRef = useRef(value);
    const { availableVariables } = useTemplateContext();
    
    const [codePopoverOpen, setCodePopoverOpen] = useState(false);
    const [popoverAnchorRect, setPopoverAnchorRect] = useState<{ left: number; top: number } | null>(null);
    const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

    const suggestionConfig = useMemo(() => createVariableSuggestionConfig({
        availableVariables,
        onSelectVariable: (varName, range) => {
            editorRef.current?.chain().focus()
                .deleteRange(range)
                .insertContent({
                    type: 'template',
                    attrs: { rawTemplate: `<<${varName}>>` },
                })
                .run();
        },
        onSelectCode: (range, cursorCoords) => {
            console.log('[TemplateAwareTextEditor] onSelectCode called', { range, cursorCoords });
            editorRef.current?.chain().focus().deleteRange(range).run();
            setTimeout(() => {
                console.log('[TemplateAwareTextEditor] Opening code popover');
                setPopoverAnchorRect(cursorCoords);
                setCodePopoverOpen(true);
            }, 50);
        },
        onEscape: (range) => {
            editorRef.current?.chain().focus()
                .deleteRange(range)
                .insertContent('@')
                .run();
        },
    }), [availableVariables]);

    const editor = useEditor({
        extensions: [
            SingleLineDocument,
            Paragraph,
            Text,
            History,
            TemplateExtension,
            VariableSuggestion.configure({
                suggestion: suggestionConfig,
            }),
        ],
        content: templateStringToTiptap(value),
        editable: !disabled,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    'w-full h-9 px-3 py-2 text-xs font-mono rounded-md border border-input bg-transparent shadow-sm',
                    'focus:outline-none',
                    'overflow-hidden whitespace-nowrap',
                    disabled && 'opacity-50 cursor-not-allowed'
                ),
                style: 'min-height: 36px; line-height: 20px;',
            },
        },
        onUpdate: ({ editor }) => {
            if (isUpdatingRef.current) return;
            
            const json = editor.getJSON();
            const newValue = tiptapToTemplateString(json);
            
            if (newValue !== lastValueRef.current) {
                lastValueRef.current = newValue;
                onChange(newValue);
            }
        },
    });

    useEffect(() => {
        editorRef.current = editor;
    }, [editor]);

    useEffect(() => {
        console.log('[TemplateAwareTextEditor] codePopoverOpen changed to:', codePopoverOpen, 'anchorRect:', popoverAnchorRect);
    }, [codePopoverOpen, popoverAnchorRect]);

    const handleCodeSave = useCallback((template: string) => {
        editor?.chain().focus()
            .insertContent({
                type: 'template',
                attrs: { rawTemplate: template },
            })
            .run();
        setCodePopoverOpen(false);
        setPopoverAnchorRect(null);
    }, [editor]);

    useEffect(() => {
        if (!editor || value === lastValueRef.current) return;
        
        isUpdatingRef.current = true;
        lastValueRef.current = value;
        
        const newContent = templateStringToTiptap(value);
        setTimeout(() => {
            editor.commands.setContent(newContent);
            isUpdatingRef.current = false;
        }, 0);
    }, [editor, value]);

    useEffect(() => {
        if (editor) {
            editor.setEditable(!disabled);
        }
    }, [editor, disabled]);

    return (
        <div className={cn('relative flex-1', className)}>
            <EditorContent 
                editor={editor} 
                className="[&_.tiptap]:outline-none [&_.tiptap]:w-full"
            />
            {editor && editor.isEmpty && placeholder && (
                <div className="absolute top-2 left-3 text-muted-foreground text-xs pointer-events-none font-mono">
                    {placeholder}
                </div>
            )}
            <TemplateEditPopover
                template=""
                stepData={stepData}
                loopData={loopData}
                onSave={handleCodeSave}
                externalOpen={codePopoverOpen}
                onExternalOpenChange={setCodePopoverOpen}
                anchorRect={popoverAnchorRect}
                initialMode="code"
                canExecute={canExecute}
            />
        </div>
    );
}

export function TemplateAwareTextEditor({
    value,
    onChange,
    stepData,
    loopData,
    canExecute = true,
    placeholder,
    className,
    disabled = false,
}: TemplateAwareTextEditorProps) {
    return (
        <TemplateContextProvider stepData={stepData} loopData={loopData} readOnly={disabled} canExecute={canExecute}>
            <TemplateAwareTextEditorInner
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={className}
                disabled={disabled}
                stepData={stepData}
                loopData={loopData}
                canExecute={canExecute}
            />
        </TemplateContextProvider>
    );
}


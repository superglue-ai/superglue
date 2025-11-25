import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import History from '@tiptap/extension-history';
import { cn } from '@/src/lib/general-utils';
import { useEffect, useRef } from 'react';
import { TemplateExtension } from './TemplateExtension';
import { TemplateContextProvider } from './TemplateContext';
import { templateStringToTiptap, tiptapToTemplateString } from './serialization';

interface TemplateAwareTextInputProps {
    value: string;
    onChange: (value: string) => void;
    stepData: any;
    loopData?: any;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

// Custom Document that only allows one paragraph
const SingleLineDocument = Document.extend({
    content: 'paragraph',
});

function TemplateAwareTextInputInner({
    value,
    onChange,
    placeholder,
    className,
    disabled = false,
}: Omit<TemplateAwareTextInputProps, 'stepData' | 'loopData'>) {
    const isUpdatingRef = useRef(false);
    const lastValueRef = useRef(value);

    const editor = useEditor({
        extensions: [
            SingleLineDocument,
            Paragraph,
            Text,
            History,
            TemplateExtension,
        ],
        content: templateStringToTiptap(value),
        editable: !disabled,
        immediatelyRender: false, // Prevent SSR hydration mismatch
        editorProps: {
            attributes: {
                class: cn(
                    'w-full h-9 px-3 py-2 text-xs font-mono rounded-md border border-input bg-background',
                    'focus:outline-none focus:ring-1 focus:ring-ring',
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

    // Sync external value changes to editor
    useEffect(() => {
        if (!editor || value === lastValueRef.current) return;
        
        isUpdatingRef.current = true;
        lastValueRef.current = value;
        
        const newContent = templateStringToTiptap(value);
        editor.commands.setContent(newContent);
        
        isUpdatingRef.current = false;
    }, [editor, value]);

    // Update editable state
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
        </div>
    );
}

export function TemplateAwareTextInput({
    value,
    onChange,
    stepData,
    loopData,
    placeholder,
    className,
    disabled = false,
}: TemplateAwareTextInputProps) {
    return (
        <TemplateContextProvider stepData={stepData} loopData={loopData} readOnly={disabled}>
            <TemplateAwareTextInputInner
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={className}
                disabled={disabled}
            />
        </TemplateContextProvider>
    );
}


import { useRef, useState, useMemo, useCallback } from 'react';
import { prepareSourceData } from '@/src/lib/template-utils';
import { createVariableSuggestionConfig } from '../templates/TemplateVariableSuggestion';
import type { CategorizedVariables, CategorizedSources } from '../templates/tiptap/TemplateContext';
import type { Editor } from '@tiptap/react';

interface UseTemplateAwareEditorOptions {
    stepData: any;
    loopData?: any;
    categorizedVariables: CategorizedVariables;
    categorizedSources?: CategorizedSources;
}

export function useTemplateAwareEditor({
    stepData,
    loopData,
    categorizedVariables,
    categorizedSources,
}: UseTemplateAwareEditorOptions) {
    const [codePopoverOpen, setCodePopoverOpen] = useState(false);
    const [popoverAnchorPos, setPopoverAnchorPos] = useState<number | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const suggestionDestroyRef = useRef<(() => void) | null>(null);

    const sourceData = useMemo(() => prepareSourceData(stepData, loopData), [stepData, loopData]);

    const suggestionConfig = useMemo(() => createVariableSuggestionConfig({
        categorizedVariables,
        categorizedSources,
        onSelectVariable: (varName, range) => {
            const isValidIdentifier = (s: string) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
            const segments = varName.includes('\x00') ? varName.split('\x00') : [varName];
            const accessor = segments.map(seg => 
                isValidIdentifier(seg) ? `.${seg}` : `["${seg}"]`
            ).join('');
            const templateExpr = `(sourceData) => sourceData${accessor}`;
            editorRef.current?.chain().focus()
                .deleteRange(range)
                .insertContent({
                    type: 'template',
                    attrs: { rawTemplate: `<<${templateExpr}>>` },
                })
                .run();
        },
        onSelectCode: (range) => {
            editorRef.current?.chain().focus().deleteRange(range).run();
            const pos = editorRef.current?.state.selection.from ?? range.from;
            setPopoverAnchorPos(pos);
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

    const handleCodeSave = useCallback((template: string) => {
        editorRef.current?.chain().focus()
            .insertContent({
                type: 'template',
                attrs: { rawTemplate: template },
            })
            .run();
        setCodePopoverOpen(false);
        setPopoverAnchorPos(null);
    }, []);

    const getPopoverAnchorRect = useCallback(() => {
        if (popoverAnchorPos === null) return null;
        const view = editorRef.current?.view;
        if (!view) return null;
        try {
            const coords = view.coordsAtPos(popoverAnchorPos);
            return { left: coords.left, top: coords.bottom };
        } catch {
            return null;
        }
    }, [popoverAnchorPos]);

    const cleanupSuggestion = useCallback(() => {
        suggestionDestroyRef.current?.();
    }, []);

    return {
        sourceData,
        suggestionConfig,
        codePopoverOpen,
        setCodePopoverOpen,
        popoverAnchorRect: getPopoverAnchorRect,
        handleCodeSave,
        editorRef,
        cleanupSuggestion,
    };
}


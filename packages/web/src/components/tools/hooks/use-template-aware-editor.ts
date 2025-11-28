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
    const [popoverAnchorRect, setPopoverAnchorRect] = useState<{ left: number; top: number } | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const suggestionDestroyRef = useRef<(() => void) | null>(null);

    const sourceData = useMemo(() => prepareSourceData(stepData, loopData), [stepData, loopData]);

    const suggestionConfig = useMemo(() => createVariableSuggestionConfig({
        categorizedVariables,
        categorizedSources,
        onSelectVariable: (varName, range) => {
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

    const handleCodeSave = useCallback((template: string) => {
        editorRef.current?.chain().focus()
            .insertContent({
                type: 'template',
                attrs: { rawTemplate: template },
            })
            .run();
        setCodePopoverOpen(false);
        setPopoverAnchorRect(null);
    }, []);

    const cleanupSuggestion = useCallback(() => {
        suggestionDestroyRef.current?.();
    }, []);

    return {
        sourceData,
        suggestionConfig,
        codePopoverOpen,
        setCodePopoverOpen,
        popoverAnchorRect,
        handleCodeSave,
        editorRef,
        cleanupSuggestion,
    };
}


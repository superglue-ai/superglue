import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { TemplateChip } from './TemplateChip';
import { useTemplateContext } from './tiptap/TemplateContext';
import { prepareSourceData } from '@/src/lib/templating-utils';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTemplatePreview } from '../hooks/use-template-preview';

function TemplateNodeView(props: NodeViewProps) {
    const { node, deleteNode, updateAttributes, selected, editor } = props;
    const { stepData, loopData, readOnly, canExecute = true } = useTemplateContext();
    const [isEditorFocused, setIsEditorFocused] = useState(false);
    const [forcePopoverOpen, setForcePopoverOpen] = useState(false);
    
    const rawTemplate = node.attrs.rawTemplate as string;
    const expression = rawTemplate.startsWith('<<') && rawTemplate.endsWith('>>')
        ? rawTemplate.slice(2, -2).trim()
        : rawTemplate.trim();

    const sourceData = useMemo(() => prepareSourceData(stepData, loopData), [stepData, loopData]);
    const { previewValue, previewError, isEvaluating } = useTemplatePreview(
        expression,
        sourceData,
        { enabled: canExecute, debounceMs: 100 }
    );

    useEffect(() => {
        const dom = editor?.view?.dom;
        if (!dom) return;
        
        const updateFocus = () => setIsEditorFocused(dom.contains(document.activeElement));
        dom.addEventListener('focusin', updateFocus);
        dom.addEventListener('focusout', updateFocus);
        updateFocus();
        
        return () => {
            dom.removeEventListener('focusin', updateFocus);
            dom.removeEventListener('focusout', updateFocus);
        };
    }, [editor]);

    const isActuallySelected = selected && isEditorFocused;

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (isActuallySelected && e.key === 'Enter' && !readOnly) {
            e.preventDefault();
            e.stopPropagation();
            setForcePopoverOpen(true);
        }
    }, [isActuallySelected, readOnly]);

    useEffect(() => {
        const dom = editor?.view?.dom;
        if (!dom) return;
        dom.addEventListener('keydown', handleKeyDown, true);
        return () => dom.removeEventListener('keydown', handleKeyDown, true);
    }, [editor, handleKeyDown]);

    const handlePopoverOpenChange = useCallback((open: boolean) => {
        if (!open) setForcePopoverOpen(false);
    }, []);

    return (
        <NodeViewWrapper as="span" className="inline">
            <TemplateChip
                template={rawTemplate}
                evaluatedValue={previewValue}
                error={previewError ?? undefined}
                stepData={stepData}
                loopData={loopData}
                isEvaluating={isEvaluating}
                canExecute={canExecute}
                onUpdate={(newTemplate) => updateAttributes({ rawTemplate: newTemplate })}
                onDelete={deleteNode}
                readOnly={readOnly}
                inline={true}
                selected={isActuallySelected}
                forcePopoverOpen={forcePopoverOpen}
                onPopoverOpenChange={handlePopoverOpenChange}
            />
        </NodeViewWrapper>
    );
}

const TEMPLATE_REGEX = /<<(.+?)>>$/;

export const TemplateExtension = Node.create({
    name: 'template',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            rawTemplate: {
                default: '',
                parseHTML: element => element.getAttribute('data-template'),
                renderHTML: attributes => ({ 'data-template': attributes.rawTemplate }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-template]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes({ class: 'template-node' }, HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TemplateNodeView);
    },

    addInputRules() {
        const nodeType = this.type;
        return [
            new InputRule({
                find: TEMPLATE_REGEX,
                handler: ({ state, range, match }) => {
                    const templateNode = nodeType.create({ rawTemplate: match[0] });
                    state.tr.replaceWith(range.from, range.to, templateNode);
                },
            }),
        ];
    },
});

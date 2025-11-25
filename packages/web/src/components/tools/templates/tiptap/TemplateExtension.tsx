import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { TemplateChip } from '../TemplateChip';
import { useTemplateContext } from './TemplateContext';
import { evaluateTemplate } from '@/src/lib/template-utils';
import { useEffect, useState } from 'react';


function TemplateNodeView(props: NodeViewProps) {
    const { node, deleteNode, updateAttributes, selected } = props;
    const { stepData, loopData, readOnly } = useTemplateContext();
    const [evaluation, setEvaluation] = useState<{ value?: any; error?: string }>({});
    const rawTemplate = node.attrs.rawTemplate as string;
    const expression = rawTemplate.startsWith('<<') && rawTemplate.endsWith('>>')
        ? rawTemplate.slice(2, -2).trim()
        : rawTemplate.trim();

    useEffect(() => {
        let cancelled = false;

        const evaluate = async () => {
            try {
                const result = await evaluateTemplate(expression, stepData, loopData);
                if (!cancelled) {
                    setEvaluation(result);
                }
            } catch (error) {
                if (!cancelled) {
                    setEvaluation({ error: String(error) });
                }
            }
        };

        const timer = setTimeout(evaluate, 100);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [expression, stepData, loopData]);

    const handleUpdate = (newTemplate: string) => {
        updateAttributes({ rawTemplate: newTemplate });
    };

    const handleDelete = () => {
        deleteNode();
    };

    return (
        <NodeViewWrapper as="span" className="inline">
            <TemplateChip
                template={rawTemplate}
                evaluatedValue={evaluation?.value}
                error={evaluation?.error}
                stepData={stepData}
                loopData={loopData}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                readOnly={readOnly}
                inline={true}
                selected={selected}
            />
        </NodeViewWrapper>
    );
}

// Regex to match <<...>> patterns (including nested parens for arrow functions)
// This allows <<varName>> and <<(sourceData) => sourceData.field>>
const TEMPLATE_REGEX = /<<([^<>]+|(?:\([^)]*\)\s*=>[^>]+))>>$/;

// TipTap extension for template nodes
export const TemplateExtension = Node.create({
    name: 'template',

    group: 'inline',

    inline: true,

    atom: true, // This is key - makes it an atomic unit (can't place cursor inside)

    addAttributes() {
        return {
            rawTemplate: {
                default: '',
                parseHTML: element => element.getAttribute('data-template'),
                renderHTML: attributes => {
                    return {
                        'data-template': attributes.rawTemplate,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-template]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes({ class: 'template-node' }, HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TemplateNodeView);
    },

    // Convert plain text <<template>> to node using custom InputRule
    addInputRules() {
        return [
            new InputRule({
                find: TEMPLATE_REGEX,
                handler: ({ state, range, match }) => {
                    const { tr } = state;
                    const fullMatch = match[0]; // e.g., "<<a>>"
                    const node = this.type.create({ rawTemplate: fullMatch });
                    tr.replaceWith(range.from, range.to, node);
                },
            }),
        ];
    },
});

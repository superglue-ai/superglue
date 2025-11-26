import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { TemplateChip } from './TemplateChip';
import { useTemplateContext } from './TemplateContext';
import { evaluateTemplate } from '@/src/lib/template-utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import stableStringify from 'fast-safe-stringify';

function TemplateNodeView(props: NodeViewProps) {
    const { node, deleteNode, updateAttributes, selected } = props;
    const { stepData, loopData, readOnly, canExecute = true } = useTemplateContext();
    const [evaluation, setEvaluation] = useState<{ value?: any; error?: string }>({});
    const [isEvaluating, setIsEvaluating] = useState(false);
    const rawTemplate = node.attrs.rawTemplate as string;
    const expression = rawTemplate.startsWith('<<') && rawTemplate.endsWith('>>')
        ? rawTemplate.slice(2, -2).trim()
        : rawTemplate.trim();

    const stepDataRef = useRef(stepData);
    const loopDataRef = useRef(loopData);
    stepDataRef.current = stepData;
    loopDataRef.current = loopData;

    const stepDataKey = useMemo(() => stableStringify(stepData), [stepData]);
    const loopDataKey = useMemo(() => stableStringify(loopData), [loopData]);

    useEffect(() => {
        let cancelled = false;

        if (!canExecute) {
            setEvaluation({});
            setIsEvaluating(false);
            return;
        }

        setIsEvaluating(true);

        const evaluate = async () => {
            try {
                const result = await evaluateTemplate(expression, stepDataRef.current, loopDataRef.current);
                if (!cancelled) {
                    setEvaluation(result);
                    setIsEvaluating(false);
                }
            } catch (error) {
                if (!cancelled) {
                    setEvaluation({ error: String(error) });
                    setIsEvaluating(false);
                }
            }
        };

        const timer = setTimeout(evaluate, 100);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            setIsEvaluating(false);
        };
    }, [expression, stepDataKey, loopDataKey, canExecute]);

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
                isEvaluating={isEvaluating}
                canExecute={canExecute}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                readOnly={readOnly}
                inline={true}
                selected={selected}
            />
        </NodeViewWrapper>
    );
}

// Regex to match <<...>> patterns when >> is typed
// Match any content between << and >> (non-greedy)
const TEMPLATE_REGEX = /<<([^<>]+)>>$/;

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

    addInputRules() {
        const nodeType = this.type;
        return [
            new InputRule({
                find: TEMPLATE_REGEX,
                handler: (props) => {
                    const { state, range, match } = props;
                    const fullMatch = match[0];
                    console.log('[TemplateExtension] InputRule triggered:', fullMatch, 'at range', range.from, '-', range.to);
                    
                    const templateNode = nodeType.create({ rawTemplate: fullMatch });
                    const { tr } = state;
                    
                    tr.replaceWith(range.from, range.to, templateNode);
                },
            }),
        ];
    },
});

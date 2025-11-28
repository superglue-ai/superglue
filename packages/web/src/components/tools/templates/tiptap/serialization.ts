import { JSONContent } from '@tiptap/core';
import { parseTemplateString } from '@/src/lib/template-utils';

/**
 * Convert a template string (with <<...>> templates) to TipTap JSON content
 */
export function templateStringToTiptap(value: string): JSONContent {
    if (!value) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph' }],
        };
    }
    const parts = parseTemplateString(value);
    const content: JSONContent[] = [];

    for (const part of parts) {
        if (part.type === 'text') {
            if (part.value) {
                content.push({ type: 'text', text: part.value });
            }
        } else if (part.type === 'template') {
            content.push({
                type: 'template',
                attrs: { rawTemplate: part.rawTemplate },
            });
        }
    }

    return {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: content.length > 0 ? content : undefined,
            },
        ],
    };
}

/**
 * Convert TipTap JSON content back to a template string
 */
export function tiptapToTemplateString(json: JSONContent): string {
    if (!json || !json.content) return '';
    let result = '';

    const processNode = (node: JSONContent) => {
        if (node.type === 'text') {
            result += node.text || '';
        } else if (node.type === 'template') {
            result += node.attrs?.rawTemplate || '';
        } else if (node.type === 'paragraph' || node.type === 'doc') {
            if (node.content) {
                node.content.forEach(processNode);
            }
        } else if (node.type === 'hardBreak') {
            result += '\n';
        }
    };

    processNode(json);
    return result;
}

/**
 * Convert multiline template string to TipTap JSON (for JSON editor)
 */
export function multilineTemplateStringToTiptap(value: string): JSONContent {
    if (!value) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph' }],
        };
    }

    const parts = parseTemplateString(value);
    const paragraphs: JSONContent[] = [];
    let currentParagraph: JSONContent[] = [];

        for (const part of parts) {
            if (part.type === 'text') {
            const textLines = part.value.split('\n');
            for (let i = 0; i < textLines.length; i++) {
                if (textLines[i]) {
                    currentParagraph.push({ type: 'text', text: textLines[i] });
                }
                if (i < textLines.length - 1) {
                    paragraphs.push({
                        type: 'paragraph',
                        content: currentParagraph.length > 0 ? currentParagraph : undefined,
                    });
                    currentParagraph = [];
                }
                }
            } else if (part.type === 'template') {
            currentParagraph.push({
                    type: 'template',
                    attrs: { rawTemplate: part.rawTemplate },
                });
            }
        }

        paragraphs.push({
            type: 'paragraph',
        content: currentParagraph.length > 0 ? currentParagraph : undefined,
        });

    return {
        type: 'doc',
        content: paragraphs,
    };
}


export function multilineTiptapToTemplateString(json: JSONContent): string {
    if (!json || !json.content) return '';

    const lines: string[] = [];

    for (const paragraph of json.content) {
        if (paragraph.type === 'paragraph') {
            let line = '';
            if (paragraph.content) {
                for (const node of paragraph.content) {
                    if (node.type === 'text') {
                        line += node.text || '';
                    } else if (node.type === 'template') {
                        line += node.attrs?.rawTemplate || '';
                    }
                }
            }
            lines.push(line);
        }
    }

    return lines.join('\n');
}


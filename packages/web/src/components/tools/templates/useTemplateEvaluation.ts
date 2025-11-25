import { useEffect, useState } from 'react';
import { evaluateTemplate, parseTemplateString, TemplatePart } from '@/src/lib/template-utils';

export interface TemplateEvaluation {
    value: any;
    error?: string;
}

export interface UseTemplateEvaluationResult {
    parts: TemplatePart[];
    templates: TemplatePart[];
    evaluations: Map<string, TemplateEvaluation>;
    evaluatedString: string;
    hasTemplates: boolean;
}

export function useTemplateEvaluation(
    value: string,
    stepData: any,
    loopData?: any,
    debounceMs: number = 300
): UseTemplateEvaluationResult {
    const [evaluations, setEvaluations] = useState<Map<string, TemplateEvaluation>>(new Map());
    const [evaluatedString, setEvaluatedString] = useState<string>(value);

    const parts = parseTemplateString(value);
    const templates = parts.filter(p => p.type === 'template');
    const hasTemplates = templates.length > 0;

    useEffect(() => {
        if (templates.length === 0) {
            setEvaluatedString(value);
            setEvaluations(new Map());
            return;
        }

        const timer = setTimeout(async () => {
            const newEvaluations = new Map<string, TemplateEvaluation>();
            let resultString = '';
            
            for (const part of parts) {
                if (part.type === 'text') {
                    resultString += part.value;
                } else {
                    const rawTemplate = part.rawTemplate || '';
                    try {
                        const result = await evaluateTemplate(part.value, stepData, loopData);
                        newEvaluations.set(rawTemplate, {
                            value: result.value,
                            error: result.error
                        });
                        
                        if (result.success && result.value !== undefined) {
                            const stringValue = typeof result.value === 'string' 
                                ? result.value 
                                : JSON.stringify(result.value);
                            resultString += stringValue;
                        } else {
                            resultString += rawTemplate;
                        }
                    } catch (error) {
                        newEvaluations.set(rawTemplate, {
                            value: undefined,
                            error: error instanceof Error ? error.message : String(error)
                        });
                        resultString += rawTemplate;
                    }
                }
            }
            
            setEvaluations(newEvaluations);
            setEvaluatedString(resultString);
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [value, stepData, loopData, templates.length, debounceMs]);

    return {
        parts,
        templates,
        evaluations,
        evaluatedString,
        hasTemplates
    };
}

export function findTemplateAtPosition(parts: TemplatePart[], position: number): TemplatePart | null {
    for (const part of parts) {
        if (part.type === 'template' && part.end === position) {
            return part;
        }
    }
    return null;
}

export function findTemplateContainingPosition(parts: TemplatePart[], position: number): TemplatePart | null {
    for (const part of parts) {
        if (part.type === 'template' && position > part.start && position <= part.end) {
            return part;
        }
    }
    return null;
}

export function findTemplateStartingAtPosition(parts: TemplatePart[], position: number): TemplatePart | null {
    for (const part of parts) {
        if (part.type === 'template' && part.start === position) {
            return part;
        }
    }
    return null;
}


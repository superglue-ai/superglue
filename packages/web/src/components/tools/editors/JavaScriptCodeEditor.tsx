import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { formatJavaScriptCode, isValidSourceDataArrowFunction } from '@/src/lib/general-utils';
import React, { useEffect, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { CopyButton } from '../shared/CopyButton';
import { usePrismHighlight } from './usePrismHighlight';

export const JavaScriptCodeEditor = React.memo(({ value, onChange, readOnly = false, minHeight = '200px', maxHeight = '350px', showCopy = true, resizable = false, isTransformEditor = false, autoFormatOnMount = true }: { value: string; onChange?: (value: string) => void; readOnly?: boolean; minHeight?: string; maxHeight?: string; showCopy?: boolean; resizable?: boolean; isTransformEditor?: boolean; autoFormatOnMount?: boolean; }) => {
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const effectiveHeight = resizable ? currentHeight : maxHeight;
    const [hasFormatted, setHasFormatted] = useState(false);
    const hasValidPattern = (code: string): boolean => isValidSourceDataArrowFunction(code);
    const displayValue = value || '';
    const jsHtml = usePrismHighlight(displayValue, 'javascript', 60);

    useEffect(() => {
        if (!autoFormatOnMount) return;
        if (!onChange || hasFormatted || !displayValue.trim()) return;
        formatJavaScriptCode(displayValue).then(formatted => {
            if (formatted !== displayValue) {
                onChange(formatted);
            }
            setHasFormatted(true);
        });
    }, []);

    const handleChange = (newValue: string) => {
        if (!onChange) return;
        onChange(newValue);
    };
    const lineNumbers = React.useMemo(() => (displayValue || '').split(/\r\n|\r|\n/).map((_, i) => String(i + 1)), [displayValue]);
    return (
        <div className="relative bg-muted/50 dark:bg-muted/20 rounded-lg border font-mono shadow-sm js-code-editor">
            {(showCopy || isTransformEditor) && (
                <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
                    {isTransformEditor && (
                        <HelpTooltip text="The transform must be an arrow function (sourceData) => { ... } that receives step results and returns the final output. Access each step's data via sourceData.stepId." />
                    )}
                    {showCopy && <CopyButton text={value || ''} />}
                </div>
            )}
            {resizable && (
                <div className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-10" style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.3) 50%)' }} onMouseDown={(e) => {
                    e.preventDefault();
                    const startY = e.clientY;
                    const startHeight = parseInt(currentHeight);
                    const handleMouseMove = (e: MouseEvent) => { const deltaY = e.clientY - startY; const newHeight = Math.max(150, Math.min(600, startHeight + deltaY)); setCurrentHeight(`${newHeight}px`); };
                    const handleMouseUp = () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                }} />
            )}
            <div className="flex overflow-auto" style={{ height: effectiveHeight }}>
                <div className="flex-shrink-0 bg-muted/30 border-r px-2 py-2">
                    {lineNumbers.map((lineNum) => (
                        <div key={lineNum} className="text-[10px] text-muted-foreground text-right leading-[18px] select-none">{lineNum}</div>
                    ))}
                </div>
                <div className="flex-1 px-3 py-2 whitespace-pre">
                    {isTransformEditor ? (
                        <>
                            {displayValue && !hasValidPattern(displayValue) && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                                    <span>⚠</span>
                                    <span>Code will be auto-wrapped with (sourceData) =&gt; {'{'} ... {'}'} when executed</span>
                                </div>
                            )}
                            <Editor value={displayValue} onValueChange={handleChange} highlight={() => jsHtml} padding={0} disabled={readOnly} className="font-mono text-[11px] leading-[18px] h-32" textareaClassName="outline-none focus:outline-none" textareaId="transform-editor" placeholder="(sourceData) => { return sourceData; }" style={{ background: 'transparent', lineHeight: '18px', minHeight: '100px', whiteSpace: 'pre' }} />
                        </>
                    ) : (
                        <Editor value={value || ''} onValueChange={onChange || (() => { })} highlight={() => jsHtml} padding={0} disabled={readOnly} className="font-mono text-[11px] leading-[18px]" textareaClassName="outline-none focus:outline-none" style={{ minHeight, background: 'transparent', lineHeight: '18px', whiteSpace: 'pre' }} />
                    )}
                </div>
            </div>
            <style>{`
                .js-code-editor .token.property { color: rgb(156, 163, 175); }
                .js-code-editor .token.string { color: rgb(134, 239, 172); }
                .js-code-editor .token.function { color: rgb(147, 197, 253); }
                .js-code-editor .token.boolean, .js-code-editor .token.number { color: rgb(251, 191, 36); }
                .js-code-editor .token.punctuation, .js-code-editor .token.operator { color: rgb(148, 163, 184); }
                .js-code-editor .token.keyword { color: rgb(244, 114, 182); }
                .js-code-editor .token.comment { color: rgb(100, 116, 139); font-style: italic; }
            `}</style>
        </div>
    );
});


import { cn } from '@/src/lib/general-utils';
import React, { useMemo, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { CopyButton } from '../shared/CopyButton';
import { usePrismHighlight } from './usePrismHighlight';

const HIGHLIGHTING_THRESHOLD = 100 * 1024; // 100KB

export const JsonCodeEditor = ({ value, onChange, readOnly = false, minHeight = '150px', maxHeight = '400px', placeholder = '{}', overlay, bottomRightOverlay, resizable = false }: { value: string; onChange?: (value: string) => void; readOnly?: boolean; minHeight?: string; maxHeight?: string; placeholder?: string; overlay?: React.ReactNode; bottomRightOverlay?: React.ReactNode; resizable?: boolean; }) => {
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const displayValue = useMemo(() => {
        const base = value || placeholder;
        if (readOnly && (base?.length || 0) > 150000) return `${base.slice(0, 150000)}\n...truncated...`;
        return base;
    }, [value, placeholder, readOnly]);
    
    const shouldHighlight = displayValue.length < HIGHLIGHTING_THRESHOLD;
    const jsonHtml = usePrismHighlight(shouldHighlight ? displayValue : '', 'json', 60);
    const finalHtml = shouldHighlight ? jsonHtml : displayValue;
    
    return (
        <div className={cn("relative rounded-lg border shadow-sm", readOnly ? "bg-muted/30" : "bg-background")}>
            {overlay && (<div className="absolute top-1 right-1 z-10 flex items-center gap-1">{overlay}</div>)}
            {bottomRightOverlay && (<div className="absolute bottom-1 right-1 z-10 flex items-center gap-1">{bottomRightOverlay}</div>)}
            {!overlay && (<div className="absolute top-1 right-1 z-10"><CopyButton text={value || placeholder} /></div>)}
            {resizable && (
                <div className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-10" style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.3) 50%)' }} onMouseDown={(e) => {
                    e.preventDefault();
                    const startY = e.clientY;
                    const startHeight = parseInt(currentHeight);
                    const handleMouseMove = (e: MouseEvent) => { const deltaY = e.clientY - startY; const newHeight = Math.max(60, Math.min(600, startHeight + deltaY)); setCurrentHeight(`${newHeight}px`); };
                    const handleMouseUp = () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                }} />
            )}
            <div className={cn("p-3 pr-10 overflow-auto", readOnly ? "cursor-not-allowed" : "cursor-text")} style={{ maxHeight: resizable ? currentHeight : maxHeight, scrollbarGutter: 'stable both-edges' }}>
                <Editor value={displayValue} onValueChange={onChange || (() => { })} highlight={() => finalHtml} padding={0} disabled={readOnly} className="font-mono text-xs" textareaClassName="outline-none focus:outline-none" style={{ minHeight, background: 'transparent' }} />
            </div>
        </div>
    );
};


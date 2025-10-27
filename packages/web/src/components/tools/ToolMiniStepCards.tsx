import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { FileChip } from '@/src/components/ui/FileChip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import JsonSchemaEditor from '@/src/components/utils/JsonSchemaEditor';
import { downloadJson } from '@/src/lib/download-utils';
import { ALLOWED_EXTENSIONS, formatBytes, isAllowedFileType, MAX_TOTAL_FILE_SIZE_TOOLS, type UploadedFileInfo } from '@/src/lib/file-utils';
import { cn, ensureSourceDataArrowFunction, formatJavaScriptCode, getIntegrationIcon, getSimpleIcon, isEmptyData, isValidSourceDataArrowFunction, truncateForDisplay, truncateLines } from '@/src/lib/general-utils';
import { Integration } from '@superglue/client';
import { inferJsonSchema } from '@superglue/shared';
import { Check, Code2, Copy, Download, Eye, FileJson, Globe, Package, Play, RotateCw, Settings, Upload, X } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';

export function usePrismHighlight(code: string, language: 'javascript' | 'json', delayMs = 40): string {
    const [html, setHtml] = useState<string>('');
    const lastHtmlRef = useRef<string>('');
    const highlightFn = useMemo(() => {
        return (c: string) => {
            try {
                const lang = language === 'javascript' ? Prism.languages.javascript : Prism.languages.json;
                return Prism.highlight(c, lang, language);
            } catch {
                return c;
            }
        };
    }, [language]);

    useEffect(() => {
        let cancelled = false;
        let cancel: (() => void) | null = null;
        const schedule = (fn: () => void) => {
            const w: any = window as any;
            if (typeof w.requestIdleCallback === 'function') {
                const id = w.requestIdleCallback(fn, { timeout: delayMs });
                return () => w.cancelIdleCallback?.(id);
            }
            const id = window.requestAnimationFrame(fn);
            return () => window.cancelAnimationFrame(id);
        };

        cancel = schedule(() => {
            if (cancelled) return;
            const next = highlightFn(code);
            if (!cancelled) {
                lastHtmlRef.current = next;
                setHtml(next);
            }
        });

        return () => {
            cancelled = true;
            cancel?.();
        };
    }, [code, highlightFn, delayMs]);

    return html || lastHtmlRef.current || code;
}


export const CopyButton = ({ text, getData }: { text?: string; getData?: () => any }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const textToCopy = getData ? (typeof getData() === 'string' ? getData() : JSON.stringify(getData(), null, 2)) : (text || '');
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button onClick={handleCopy} className="h-6 w-6 flex items-center justify-center rounded hover:bg-background/80 transition-colors bg-background/60 backdrop-blur" title="Copy" type="button">
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
        </button>
    );
};

export const InstructionDisplay = ({ instruction, onEdit, showEditButton = true }: { instruction: string; onEdit?: () => void; showEditButton?: boolean; }) => {
    const [showFull, setShowFull] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isTruncated, setIsTruncated] = useState(false);
    const textRef = useRef<HTMLParagraphElement>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(instruction);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const normalizedText = instruction.replace(/\n/g, ' ');

    useEffect(() => {
        if (textRef.current) {
            const element = textRef.current;
            setIsTruncated(element.scrollHeight > element.clientHeight);
        }
    }, [normalizedText]);

    return (
        <>
            <div className="max-w-[75%]">
                <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="font-bold text-[13px]">Tool Instruction:</h3>
                    <div className="flex items-center gap-1">
                        {isTruncated && (
                            <Button variant="ghost" size="icon" className="h-[16px] w-[16px] p-0 mr-2" onClick={() => setShowFull(true)} title="View full instruction">
                                <Eye className="h-2.5 w-2.5" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-[16px] w-[16px] p-0" onClick={handleCopy} title="Copy instruction">
                            {copied ? <Check size={9} className="scale-[0.8]" /> : <Copy size={9} className="scale-[0.8]" />}
                        </Button>

                    </div>
                </div>
                <p
                    ref={textRef}
                    className="text-[13px] text-muted-foreground line-clamp-2"
                >
                    {normalizedText}
                </p>
            </div>
            {showFull && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowFull(false)}>
                    <Card className="max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 relative">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Tool Instruction</h3>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(instruction); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Copy">
                                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setShowFull(false)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                                <p className="text-sm font-mono whitespace-pre-wrap">{instruction}</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </>
    );
};


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

    // highlighting handled by usePrismHighlight
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
                            <Editor value={displayValue} onValueChange={handleChange} highlight={() => jsHtml} padding={0} disabled={readOnly} className="font-mono text-[11px] leading-[18px]" textareaClassName="outline-none focus:outline-none" textareaId="transform-editor" placeholder="(sourceData) => { return sourceData; }" style={{ background: 'transparent', lineHeight: '18px', minHeight: '100px', whiteSpace: 'pre' }} />
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

export const JsonCodeEditor = ({ value, onChange, readOnly = false, minHeight = '150px', maxHeight = '400px', placeholder = '{}', overlay, bottomRightOverlay, resizable = false }: { value: string; onChange?: (value: string) => void; readOnly?: boolean; minHeight?: string; maxHeight?: string; placeholder?: string; overlay?: React.ReactNode; bottomRightOverlay?: React.ReactNode; resizable?: boolean; }) => {
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const displayValue = React.useMemo(() => {
        const base = value || placeholder;
        if (readOnly && (base?.length || 0) > 150000) return `${base.slice(0, 150000)}\n...truncated...`;
        return base;
    }, [value, placeholder, readOnly]);
    const jsonHtml = usePrismHighlight(displayValue, 'json', 60);
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
                <Editor value={displayValue} onValueChange={onChange || (() => { })} highlight={() => jsonHtml} padding={0} disabled={readOnly} className="font-mono text-xs" textareaClassName="outline-none focus:outline-none" style={{ minHeight, background: 'transparent' }} />
            </div>
        </div>
    );
};


export const PayloadSpotlight = ({
    payloadText,
    inputSchema,
    onChange,
    onInputSchemaChange,
    readOnly,
    onFilesUpload,
    uploadedFiles = [],
    onFileRemove,
    isProcessingFiles = false,
    totalFileSize = 0,
    extractPayloadSchema
}: {
    payloadText: string;
    inputSchema?: string | null;
    onChange?: (value: string) => void;
    onInputSchemaChange?: (value: string | null) => void;
    readOnly?: boolean;
    onFilesUpload?: (files: File[]) => Promise<void>;
    uploadedFiles?: UploadedFileInfo[];
    onFileRemove?: (fileName: string) => void;
    isProcessingFiles?: boolean;
    totalFileSize?: number;
    extractPayloadSchema?: (schema: string | null) => any | null;
}) => {
    const [activeTab, setActiveTab] = useState('payload');
    const [localPayload, setLocalPayload] = useState<string>(payloadText || '');
    const [localInputSchema, setLocalInputSchema] = useState(inputSchema || null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLocalPayload(payloadText || '');
    }, [payloadText]);
    useEffect(() => { setLocalInputSchema(inputSchema || null); }, [inputSchema]);

    const handlePayloadChange = (value: string) => {
        setLocalPayload(value);
        const trimmed = (value || '').trim();
        if (trimmed === '') {
            setError(null);
            if (onChange) onChange(value);
            return;
        }
        try {
            JSON.parse(value);
            setError(null);
            if (onChange) onChange(value);
        } catch {
            setError('Invalid JSON');
        }
    };

    const handleSchemaChange = (value: string | null) => {
        setLocalInputSchema(value);
        if (onInputSchemaChange) onInputSchemaChange(value);
    };

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const invalidFiles = files.filter(f => !isAllowedFileType(f.name));
        if (invalidFiles.length > 0) {
            setError(`Unsupported file types: ${invalidFiles.map(f => f.name).join(', ')}`);
            return;
        }

        if (onFilesUpload) {
            await onFilesUpload(files);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleFileInputChange}
                className="hidden"  
            />
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-9 p-1 rounded-md mb-3">
                    <TabsTrigger value="payload" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                        <FileJson className="h-4 w-4" /> Payload JSON
                    </TabsTrigger>
                    <TabsTrigger value="schema" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                        <Code2 className="h-4 w-4" /> Input Schema
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="payload" className="mt-3 space-y-3">
                    {!readOnly && onFilesUpload && uploadedFiles.length > 0 && (
                        <div className="space-y-1.5">
                            {uploadedFiles.map(file => (
                                <FileChip
                                    key={file.key}
                                    file={file}
                                    onRemove={onFileRemove}
                                    size="default"
                                    rounded="md"
                                    showOriginalName={true}
                                    showKey={true}
                                />
                            ))}
                        </div>
                    )}
                    <JsonSchemaEditor
                        value={localPayload}
                        onChange={(val) => handlePayloadChange(val || '')}
                        isOptional={false}
                        readOnly={!!readOnly}
                        forceCodeMode={true}
                        showModeToggle={false}
                    />
                    {!readOnly && onFilesUpload && (
                        <div className="pt-3 border-t border-border/50 space-y-3">
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isProcessingFiles || totalFileSize >= MAX_TOTAL_FILE_SIZE_TOOLS}
                                    className="h-9 px-4"
                                >
                                    {isProcessingFiles ? (
                                        <>
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                                            Processing Files...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-3.5 w-3.5 mr-2" />
                                            Upload Files
                                        </>
                                    )}
                                </Button>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{formatBytes(totalFileSize)} / {formatBytes(MAX_TOTAL_FILE_SIZE_TOOLS)}</span>
                                    <HelpTooltip text="Upload CSV, JSON, XML, or Excel files. Files will be automatically parsed to JSON and merged with the manual payload when the tool executes." />
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="schema" className="mt-3">
                    <JsonSchemaEditor
                        value={extractPayloadSchema && localInputSchema ? JSON.stringify(extractPayloadSchema(localInputSchema), null, 2) : localInputSchema}
                        onChange={(value) => {
                            // When user edits, we need to wrap it back in the full schema structure
                            if (value && value.trim() !== '') {
                                try {
                                    const payloadSchema = JSON.parse(value);
                                    const fullSchema = {
                                        type: 'object',
                                        properties: {
                                            payload: payloadSchema
                                        }
                                    };
                                    handleSchemaChange(JSON.stringify(fullSchema, null, 2));
                                } catch (e) {
                                    // If parsing fails, just pass through
                                    handleSchemaChange(value);
                                }
                            } else {
                                handleSchemaChange(value);
                            }
                        }}
                        isOptional={true}
                        showModeToggle={true}
                    />
                    <div className="mt-2 text-[10px] text-muted-foreground">
                        <HelpTooltip text="Input Schema is optional documentation/validation describing expected payload shape. The payload JSON is what runs; schema does not inject credentials nor drive payload. Leave disabled if not needed." />
                    </div>
                </TabsContent>
            </Tabs>
        </>
    );
};

export const PayloadMiniStepCard = ({
    payloadText,
    inputSchema,
    onChange,
    onInputSchemaChange,
    readOnly,
    onFilesUpload,
    uploadedFiles,
    onFileRemove,
    isProcessingFiles,
    totalFileSize,
    extractPayloadSchema
}: {
    payloadText: string;
    inputSchema?: string | null;
    onChange?: (value: string) => void;
    onInputSchemaChange?: (value: string | null) => void;
    readOnly?: boolean;
    onFilesUpload?: (files: File[]) => Promise<void>;
    uploadedFiles?: UploadedFileInfo[];
    onFileRemove?: (key: string) => void;
    isProcessingFiles?: boolean;
    totalFileSize?: number;
    extractPayloadSchema?: (schema: string | null) => any | null;
}) => {
    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">Tool Input</h3>
                    </div>
                    <HelpTooltip text="Payload is the JSON input to tool execution. Editing here does NOT save values to the tool; it only affects this session/run. Use Input Schema to optionally describe the expected structure for validation and tooling." />
                </div>
                <PayloadSpotlight
                    payloadText={payloadText}
                    inputSchema={inputSchema}
                    onChange={onChange}
                    onInputSchemaChange={onInputSchemaChange}
                    readOnly={readOnly}
                    onFilesUpload={onFilesUpload}
                    uploadedFiles={uploadedFiles}
                    onFileRemove={onFileRemove}
                    isProcessingFiles={isProcessingFiles}
                    totalFileSize={totalFileSize}
                    extractPayloadSchema={extractPayloadSchema}
                />
            </div>
        </Card>
    );
};

const MAX_DISPLAY_LINES = 3000;
export const FinalTransformMiniStepCard = ({ transform, responseSchema, onTransformChange, onResponseSchemaChange, readOnly, onExecuteTransform, isExecutingTransform, canExecute, transformResult, stepInputs, hasTransformCompleted }: { transform?: string; responseSchema?: string; onTransformChange?: (value: string) => void; onResponseSchemaChange?: (value: string) => void; readOnly?: boolean; onExecuteTransform?: (schema: string, transform: string) => void; isExecutingTransform?: boolean; canExecute?: boolean; transformResult?: any; stepInputs?: any; hasTransformCompleted?: boolean; }) => {
    const [activeTab, setActiveTab] = useState('transform');
    const [localTransform, setLocalTransform] = useState(transform || '');
    const [localSchema, setLocalSchema] = useState(responseSchema || '');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');
    const [schemaInitialized, setSchemaInitialized] = useState(false);
    useEffect(() => { setLocalTransform(transform || ''); }, [transform]);
    useEffect(() => { if (!schemaInitialized) { setLocalSchema(responseSchema || ''); setSchemaInitialized(true); } }, [responseSchema, schemaInitialized]);
    useEffect(() => { const handleTabChange = () => { if (onTransformChange && localTransform !== transform) onTransformChange(localTransform); if (onResponseSchemaChange && localSchema !== responseSchema) onResponseSchemaChange(localSchema); }; handleTabChange(); }, [activeTab]);

    // Switch to output tab when transform completes
    useEffect(() => {
        if (hasTransformCompleted) {
            setActiveTab('output');
        }
    }, [hasTransformCompleted]);
    const handleTransformChange = (value: string) => { setLocalTransform(value); };
    const handleSchemaChange = (value: string | null) => {
        if (value === null || value === '') {
            setLocalSchema('');
            if (onResponseSchemaChange) onResponseSchemaChange('');
        } else {
            setLocalSchema(value);
            if (onResponseSchemaChange) onResponseSchemaChange(value);
        }
    };
    const ensureValidTransform = (code: string): string => ensureSourceDataArrowFunction(code);
    const handleExecuteTransform = () => {
        const validTransform = ensureValidTransform(localTransform);
        if (onTransformChange) onTransformChange(localTransform);
        if (onResponseSchemaChange) onResponseSchemaChange(localSchema);
        if (onExecuteTransform) onExecuteTransform(localSchema, validTransform);
    };
    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">Tool Result</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {!readOnly && onExecuteTransform && (
                            <>
                                <span title={!canExecute ? "Execute all steps first" : isExecutingTransform ? "Transform is executing..." : "Test final transform"}>
                                    <Button
                                        variant="ghost"
                                        onClick={handleExecuteTransform}
                                        disabled={!canExecute || isExecutingTransform}
                                        className="h-8 px-3 gap-2"
                                    >
                                        {isExecutingTransform ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        ) : (
                                            <Play className="h-3 w-3" />
                                        )}
                                        <span className="font-medium text-[13px]">Run Transform Code</span>
                                    </Button>
                                </span>
                                <HelpTooltip text="Executes the final transform script with step results as input. If a result schema is enabled, the output will be validated against it." />
                            </>
                        )}
                    </div>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="h-9 p-1 rounded-md mb-3">
                        <TabsTrigger value="inputs" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <FileJson className="h-4 w-4" /> Step Inputs
                        </TabsTrigger>
                        <TabsTrigger value="transform" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <Code2 className="h-4 w-4" /> Transform Code
                        </TabsTrigger>
                        <TabsTrigger value="schema" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <Settings className="h-4 w-4" /> Result Schema
                        </TabsTrigger>
                        {hasTransformCompleted && (
                            <TabsTrigger value="output" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm" style={{ backgroundColor: '#FFA500', color: '#000' }}>
                                <Package className="h-4 w-4" /> Tool Result
                            </TabsTrigger>
                        )}
                    </TabsList>
                    <TabsContent value="inputs" className="mt-2">
                        {(() => {
                            let inputString = '';
                            let isTruncated = false;
                            let copyText = '';
                            if (inputViewMode === 'schema') {
                                const schemaObj = inferJsonSchema(stepInputs || {});
                                inputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                                copyText = inputString;
                            } else {
                                const displayData = truncateForDisplay(stepInputs);
                                inputString = displayData.value;
                                isTruncated = displayData.truncated;
                                copyText = inputString;
                            }
                            const fullJson = stepInputs !== undefined ? JSON.stringify(stepInputs, null, 2) : '';
                            const bytes = stepInputs === undefined ? 0 : new Blob([fullJson]).size;
                            return (
                                <>
                                    <JsonCodeEditor value={inputString} readOnly={true} minHeight="150px" maxHeight="250px" resizable={true} overlay={<div className="flex items-center gap-2"><Tabs value={inputViewMode} onValueChange={(v) => setInputViewMode(v as 'preview' | 'schema')} className="w-auto"><TabsList className="h-6 rounded-md"><TabsTrigger value="preview" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger><TabsTrigger value="schema" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger></TabsList></Tabs><span className="text-[10px] text-muted-foreground">{bytes.toLocaleString()} bytes</span><CopyButton text={copyText} /><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadJson(stepInputs, 'transform_step_inputs.json')} title="Download transform inputs as JSON"><Download className="h-3 w-3" /></Button></div>} />
                                    {isTruncated && inputViewMode === 'preview' && (<div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">Preview truncated for display performance</div>)}
                                </>
                            );
                        })()}
                    </TabsContent>
                    <TabsContent value="transform" className="mt-2">
                        <JavaScriptCodeEditor value={localTransform} onChange={handleTransformChange} readOnly={readOnly} minHeight="150px" maxHeight="250px" resizable={true} isTransformEditor={true} />
                    </TabsContent>
                    <TabsContent value="schema" className="mt-2">
                        <div className="space-y-3">
                            <JsonSchemaEditor value={localSchema || ''} onChange={handleSchemaChange} isOptional={true} showModeToggle={true} />
                        </div>
                    </TabsContent>
                    {hasTransformCompleted && (
                        <TabsContent value="output" className="mt-2">
                            {(() => {
                                const isPending = transformResult === undefined;
                                let outputString = '';
                                let isTruncated = false;
                                if (!isPending) {
                                    if (outputViewMode === 'schema') {
                                        const schemaObj = inferJsonSchema(transformResult || {});
                                        outputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                                    } else {
                                        const displayData = truncateForDisplay(transformResult);
                                        outputString = displayData.value;
                                        isTruncated = displayData.truncated;
                                    }
                                }
                                const fullJson = transformResult !== undefined ? JSON.stringify(transformResult, null, 2) : '';
                                const bytes = transformResult === undefined ? 0 : new Blob([fullJson]).size;
                                const isEmpty = !isPending && isEmptyData(fullJson);
                                return (
                                    <>
                                        {isPending ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg">
                                                <Package className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="text-sm">No result yet</p>
                                                <p className="text-xs mt-1">Run the tool or test the transform to see results</p>
                                            </div>
                                        ) : (
                                            <>
                                                <JsonCodeEditor value={outputString} readOnly minHeight="150px" maxHeight="250px" resizable={true} overlay={<div className="flex items-center gap-2"><Tabs value={outputViewMode} onValueChange={(v) => setOutputViewMode(v as 'preview' | 'schema')} className="w-auto"><TabsList className="h-6 rounded-md"><TabsTrigger value="preview" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger><TabsTrigger value="schema" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger></TabsList></Tabs><span className="text-[10px] text-muted-foreground">{bytes.toLocaleString()} bytes</span><CopyButton text={outputString} /><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadJson(transformResult, 'tool_result.json')} title="Download tool result as JSON"><Download className="h-3 w-3" /></Button></div>} />
                                                {isEmpty && (<div className="mt-2 text-xs text-amber-700 dark:text-amber-300">⚠ No data returned. Is this expected?</div>)}
                                                {isTruncated && outputViewMode === 'preview' && (<div className="mt-2 text-xs text-amber-600 dark:text-amber-300">Preview truncated for display performance. Use copy button to get full data.</div>)}
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </Card>
    );
};

const getStatusInfo = (isRunning: boolean, isFailed: boolean, isCompleted: boolean) => {
    if (isRunning) return {
        text: "Running",
        color: "text-amber-600 dark:text-amber-400",
        dotColor: "bg-amber-600 dark:bg-amber-400",
        animate: true
    };
    if (isFailed) return {
        text: "Failed",
        color: "text-red-600 dark:text-red-400",
        dotColor: "bg-red-600 dark:bg-red-400",
        animate: false
    };
    if (isCompleted) return {
        text: "Completed",
        color: "text-muted-foreground",
        dotColor: "bg-green-600 dark:bg-green-400",
        animate: false
    };
    return {
        text: "Pending",
        color: "text-gray-500 dark:text-gray-400",
        dotColor: "bg-gray-500 dark:bg-gray-400",
        animate: false
    };
};

export const MiniStepCard = ({ step, index, isActive, onClick, stepId, isPayload = false, isTransform = false, isRunningAll = false, isTesting = false, completedSteps = [], failedSteps = [], isFirstCard = false, isLastCard = false, integrations = [], hasTransformCompleted = false, isPayloadValid = true, payloadData }: { step: any; index: number; isActive: boolean; onClick: () => void; stepId?: string | null; isPayload?: boolean; isTransform?: boolean; isRunningAll?: boolean; isTesting?: boolean; completedSteps?: string[]; failedSteps?: string[]; isFirstCard?: boolean; isLastCard?: boolean; integrations?: Integration[]; hasTransformCompleted?: boolean; isPayloadValid?: boolean; payloadData?: any; }) => {
    if (isPayload) {
        return (
            <div className={cn("cursor-pointer transition-all duration-300 ease-out transform flex items-center", "opacity-90 hover:opacity-100 hover:scale-[1.01]")} onClick={onClick} style={{ height: '100%' }}>
                <Card className={cn(
                    "w-[180px] h-[110px] flex-shrink-0",
                    isActive ? "pt-3 px-3 pb-3" : "pt-3 px-3 pb-[18px]",
                    isActive && "ring-2 ring-primary shadow-lg",
                    isFirstCard && "rounded-l-2xl bg-gradient-to-br from-primary/5 to-transparent",
                    !isPayloadValid && !isActive && "ring-1 ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/20"
                )}>
                    <div className="h-[88px] flex flex-col items-center justify-between leading-tight">
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className={cn(
                                "p-2 rounded-full",
                                !isPayloadValid ? "bg-amber-500/20" : "bg-primary/10"
                            )}>
                                {!isPayloadValid ? (
                                    <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                ) : (
                                    <Play className="h-4 w-4 text-primary" />
                                )}
                            </div>
                            <span className="text-[11px] font-semibold mt-1.5">Start</span>
                            <span className="text-[9px] text-muted-foreground">Tool Input</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            {!isPayloadValid ? (
                                <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">Tool Input Required</span>
                            ) : (() => {
                                const isEmptyPayload = !payloadData ||
                                    (typeof payloadData === 'object' && Object.keys(payloadData).length === 0) ||
                                    (typeof payloadData === 'string' && (!payloadData.trim() || payloadData.trim() === '{}'));

                                if (isEmptyPayload) {
                                    return <span className="text-[9px] font-medium text-muted-foreground">No Input</span>;
                                } else {
                                    return <span className="text-[9px] font-medium text-muted-foreground">JSON Provided</span>;
                                }
                            })()}
                        </div>
                    </div>
                </Card>
            </div>
        );
    }
    if (isTransform) {
        const isCompleted = completedSteps.includes('__final_transform__');
        const isFailed = failedSteps.includes('__final_transform__');
        const isRunning = isTesting || isRunningAll;
        const statusInfo = getStatusInfo(isRunning, isFailed, isCompleted);
        return (
            <div className={cn("cursor-pointer transition-all duration-300 ease-out transform", "opacity-90 hover:opacity-100 hover:scale-[1.01]")} onClick={onClick} style={{ height: '100%' }}>
                <Card className={cn(
                    "w-[180px] h-[110px] flex-shrink-0",
                    isActive ? "pt-3 px-3 pb-3" : "pt-3 px-3 pb-[18px]",
                    isActive && "ring-2 ring-primary shadow-lg",
                    isLastCard && !hasTransformCompleted && "rounded-r-2xl bg-gradient-to-bl from-purple-500/5 to-transparent"
                )}>
                    <div className="h-[88px] flex flex-col items-center justify-between leading-tight">
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="p-2 rounded-full bg-primary/10">
                                <Package className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-[11px] font-semibold mt-1.5">Tool Result</span>
                            <span className="text-[9px] text-muted-foreground">Transform</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <span className={cn("text-[9px] font-medium flex items-center gap-1", statusInfo.color)}>
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    statusInfo.dotColor,
                                    statusInfo.animate && "animate-pulse"
                                )} />
                                {statusInfo.text}
                            </span>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }
    const isCompleted = stepId ? completedSteps.includes(stepId) : false;
    const isFailed = stepId ? failedSteps.includes(stepId) : false;
    const isRunning = isTesting || (isRunningAll && !!stepId);
    const statusInfo = getStatusInfo(isRunning, isFailed, isCompleted);

    // Find matching integration for this step
    const linkedIntegration = integrations?.find(integration => {
        if (step.integrationId && integration.id === step.integrationId) return true;
        return step.apiConfig?.urlHost && integration.urlHost && step.apiConfig.urlHost.includes(integration.urlHost.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, ''));
    });

    const iconName = linkedIntegration ? getIntegrationIcon(linkedIntegration) : null;
    const simpleIcon = iconName ? getSimpleIcon(iconName) : null;

    return (
        <div className={cn("cursor-pointer transition-all duration-300 ease-out transform", "opacity-90 hover:opacity-100 hover:scale-[1.01]")} onClick={onClick}>
            <Card className={cn(
                "w-[180px] h-[110px] flex-shrink-0",
                isActive ? "pt-3 px-3 pb-3" : "pt-3 px-3 pb-[18px]",
                isActive && "ring-2 ring-primary shadow-lg"
            )}>
                <div className="h-[88px] flex flex-col relative">
                    <div className="absolute top-0 left-0 flex items-center h-5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">
                            {index}
                        </span>
                    </div>
                    {step?.executionMode === 'LOOP' && (
                        <div className="absolute top-0 right-0 flex items-center h-5">
                            <RotateCw className="h-3 w-3 text-muted-foreground" aria-label="Loop step" />
                        </div>
                    )}
                    <div className="flex-1 flex flex-col items-center justify-between leading-tight">
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="p-2 rounded-full bg-white dark:bg-gray-100 border border-border/50">
                                {simpleIcon ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill={`#${simpleIcon.hex}`} className="flex-shrink-0">
                                        <path d={simpleIcon.path} />
                                    </svg>
                                ) : (
                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                )}
                            </div>
                            <span className="text-[11px] font-semibold mt-1.5 truncate max-w-[140px]" title={step.id || `Step ${index}`}>{step.id || `Step ${index}`}</span>
                            {linkedIntegration && (
                                <span className="text-[9px] text-muted-foreground">{linkedIntegration.id}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <span className={cn("text-[9px] font-medium flex items-center gap-1", statusInfo.color)}>
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    statusInfo.dotColor,
                                    statusInfo.animate && "animate-pulse"
                                )} />
                                {statusInfo.text}
                            </span>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export { truncateForDisplay, truncateLines };



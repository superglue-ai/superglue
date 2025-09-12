import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import JsonSchemaEditor from '@/src/components/utils/JsonSchemaEditor';
import { formatBytes, isAllowedFileType, MAX_TOTAL_FILE_SIZE, type UploadedFileInfo } from '@/src/lib/file-utils';
import { cn, formatJavaScriptCode, isEmptyData, truncateForDisplay, truncateLines } from '@/src/lib/utils';
import { inferJsonSchema } from '@superglue/shared';
import { Check, Code2, Copy, Eye, FileJson, Package, Play, Upload, X } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import React, { useEffect, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';

const MAX_HIGHLIGHT_CHARS = 100000;
const highlightCode = (code: string, language: string) => {
    if (!code || code.length > MAX_HIGHLIGHT_CHARS) return code;
    try {
        if (language === 'javascript' || language === 'js') {
            const jsLang = Prism.languages.javascript || Prism.languages.js;
            if (jsLang) return Prism.highlight(code, jsLang, 'javascript');
        } else if (language === 'json') {
            const jsonLang = Prism.languages.json;
            if (jsonLang) return Prism.highlight(code, jsonLang, 'json');
        }
        return code;
    } catch {
        return code;
    }
};


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
    const MAX_LENGTH = 100;
    const truncated = instruction.length > MAX_LENGTH ? instruction.substring(0, MAX_LENGTH) + '...' : instruction;
    const handleCopy = () => {
        navigator.clipboard.writeText(instruction);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md border max-w-full overflow-hidden h-[36px]">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                    <p className="text-sm text-muted-foreground font-medium">Instruction:</p>
                    <p className="text-sm font-mono text-foreground truncate flex-1">{truncated}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {instruction.length > MAX_LENGTH && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowFull(true)} title="View full instruction">
                            <Eye className="h-3 w-3" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} title="Copy">
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    {onEdit && showEditButton && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Edit">
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>
            {showFull && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowFull(false)}>
                    <Card className="max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 relative">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Workflow Instruction</h3>
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

export const FinalResultsCard = ({ result }: { result: any }) => {
    const [copied, setCopied] = useState(false);
    const isPending = result === undefined;
    const displayData = isPending ? { value: '', truncated: false } : truncateForDisplay(result);
    const fullJson = result !== undefined ? JSON.stringify(result, null, 2) : '';
    const bytes = isPending ? 0 : new Blob([fullJson]).size;
    const isEmpty = !isPending && isEmptyData(fullJson);
    const handleCopy = () => {
        navigator.clipboard.writeText(fullJson);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">Final Result</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{bytes.toLocaleString()} bytes</span>
                        {!isPending && (
                            <button
                                onClick={handleCopy}
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-background/80 transition-colors bg-background/60 backdrop-blur"
                                title="Copy full result data"
                                type="button"
                            >
                                {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                            </button>
                        )}
                    </div>
                </div>
                <div className="relative">
                    {isPending ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Package className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">No results yet</p>
                            <p className="text-xs mt-1">Run the workflow or test the transform to see results</p>
                        </div>
                    ) : (
                        <>
                            <JsonCodeEditor value={displayData.value} readOnly minHeight="220px" maxHeight="420px" />
                            {isEmpty && (<div className="mt-2 text-xs text-amber-700 dark:text-amber-300">⚠ No data returned. Is this expected?</div>)}
                            {displayData.truncated && (<div className="mt-2 text-xs text-amber-600 dark:text-amber-300">Preview truncated for display performance. Use copy button to get full data.</div>)}
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
};

export const JavaScriptCodeEditor = React.memo(({ value, onChange, readOnly = false, minHeight = '200px', maxHeight = '350px', showCopy = true, resizable = false, isTransformEditor = false }: { value: string; onChange?: (value: string) => void; readOnly?: boolean; minHeight?: string; maxHeight?: string; showCopy?: boolean; resizable?: boolean; isTransformEditor?: boolean; }) => {
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const effectiveHeight = resizable ? currentHeight : maxHeight;
    const highlightTimer = useRef<number | null>(null);
    const [allowHighlight, setAllowHighlight] = useState<boolean>(true);
    const [hasFormatted, setHasFormatted] = useState(false);
    const hasValidPattern = (code: string): boolean => {
        const arrowFunctionPattern = /^\s*\(\s*sourceData\s*\)\s*=>\s*\{[\s\S]*\}\s*;?\s*$/;
        return arrowFunctionPattern.test(code);
    };
    const displayValue = value || '';

    useEffect(() => {
        if (!onChange || hasFormatted || !displayValue.trim()) return;
        formatJavaScriptCode(displayValue).then(formatted => {
            if (formatted !== displayValue) {
                onChange(formatted);
            }
            setHasFormatted(true);
        });
    }, []);

    useEffect(() => {
        setAllowHighlight(false);
        if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
        highlightTimer.current = window.setTimeout(() => { setAllowHighlight(true); }, 120);
        return () => { if (highlightTimer.current) { window.clearTimeout(highlightTimer.current); highlightTimer.current = null; } };
    }, [displayValue]);
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
                            <Editor value={displayValue} onValueChange={handleChange} highlight={(code) => { if (!allowHighlight) return code; try { return Prism.highlight(code, Prism.languages.javascript, 'javascript'); } catch { return code; } }} padding={0} disabled={readOnly} className="font-mono text-[11px] leading-[18px]" textareaClassName="outline-none focus:outline-none" textareaId="transform-editor" placeholder="(sourceData) => { return sourceData; }" style={{ background: 'transparent', lineHeight: '18px', minHeight: '100px', whiteSpace: 'pre' }} />
                        </>
                    ) : (
                        <Editor value={value || ''} onValueChange={onChange || (() => { })} highlight={(code) => { if (!allowHighlight) return code; try { return Prism.highlight(code, Prism.languages.javascript, 'javascript'); } catch { return code; } }} padding={0} disabled={readOnly} className="font-mono text-[11px] leading-[18px]" textareaClassName="outline-none focus:outline-none" style={{ minHeight, background: 'transparent', lineHeight: '18px', whiteSpace: 'pre' }} />
                    )}
                </div>
            </div>
            <style jsx global>{`
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

export const JsonCodeEditor = ({ value, onChange, readOnly = false, minHeight = '150px', maxHeight = '400px', placeholder = '{}', overlay, resizable = false }: { value: string; onChange?: (value: string) => void; readOnly?: boolean; minHeight?: string; maxHeight?: string; placeholder?: string; overlay?: React.ReactNode; resizable?: boolean; }) => {
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const displayValue = React.useMemo(() => {
        const base = value || placeholder;
        if (readOnly && (base?.length || 0) > 150000) return `${base.slice(0, 150000)}\n...truncated...`;
        return base;
    }, [value, placeholder, readOnly]);
    return (
        <div className={cn("relative rounded-lg border shadow-sm", readOnly ? "bg-muted/30 border-dashed" : "bg-background border")}>
            {overlay && (<div className="absolute top-1 right-1 z-10 flex items-center gap-1">{overlay}</div>)}
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
            <div className={cn("p-3 pr-10 overflow-auto", readOnly ? "cursor-not-allowed" : "cursor-text")} style={{ maxHeight: resizable ? currentHeight : maxHeight }}>
                <Editor value={displayValue} onValueChange={onChange || (() => { })} highlight={(code) => highlightCode(code, 'json')} padding={0} disabled={readOnly} className="font-mono text-xs" textareaClassName="outline-none focus:outline-none" style={{ minHeight, background: 'transparent' }} />
            </div>
        </div>
    );
};

// File type colors and icons
const getFileTypeInfo = (filename: string): { color: string; bgColor: string; icon: string } => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    switch (ext) {
        case 'json':
            return { color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30', icon: '{}' };
        case 'csv':
            return { color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/30', icon: '▤' };
        case 'xml':
            return { color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30', icon: '<>' };
        case 'xlsx':
        case 'xls':
            return { color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', icon: '⊞' };
        case 'txt':
            return { color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-950/30', icon: '≡' };
        default:
            return { color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-950/30', icon: '📄' };
    }
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
    totalFileSize = 0
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

        const newSize = files.reduce((sum, f) => sum + f.size, 0);
        if (totalFileSize + newSize > MAX_TOTAL_FILE_SIZE) {
            setError(`Total file size cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE)}`);
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
                accept=".json,.csv,.txt,.xml,.xlsx,.xls"
                onChange={handleFileInputChange}
                className="hidden"
            />
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 mb-3 h-8">
                    <TabsTrigger value="payload" className="text-xs">Payload JSON</TabsTrigger>
                    <TabsTrigger value="schema" className="text-xs">Input Schema</TabsTrigger>
                </TabsList>
                <TabsContent value="payload" className="mt-3 space-y-3">
                    <JsonSchemaEditor
                        value={localPayload || '{}'}
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
                                    disabled={isProcessingFiles || totalFileSize >= MAX_TOTAL_FILE_SIZE}
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
                                    <span>{formatBytes(totalFileSize)} / {formatBytes(MAX_TOTAL_FILE_SIZE)}</span>
                                    <HelpTooltip text="Upload CSV, JSON, XML, or Excel files. Files will be automatically parsed to JSON and merged with the manual payload when the workflow executes." />
                                </div>
                            </div>

                            {uploadedFiles.length > 0 && (
                                <div className="space-y-1.5">
                                    {uploadedFiles.map(file => {
                                        const fileInfo = getFileTypeInfo(file.name);
                                        return (
                                            <div
                                                key={file.key}
                                                className={cn(
                                                    "flex items-center justify-between px-3 py-2 rounded-md transition-all",
                                                    file.status === 'error'
                                                        ? "bg-destructive/10 border border-destructive/20"
                                                        : file.status === 'processing'
                                                            ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                                                            : `${fileInfo.bgColor} border border-border/50`
                                                )}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className={cn("font-mono text-sm", fileInfo.color)}>
                                                        {fileInfo.icon}
                                                    </span>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-xs font-medium truncate" title={file.name}>
                                                            {file.name}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {file.status === 'processing'
                                                                ? 'Parsing...'
                                                                : file.status === 'error'
                                                                    ? file.error || 'Failed to parse'
                                                                    : `${formatBytes(file.size)} • Key: ${file.key}`}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {file.status === 'processing' && (
                                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 dark:border-amber-400 border-t-transparent" />
                                                    )}
                                                    {file.status === 'ready' && (
                                                        <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                                                    )}
                                                    {onFileRemove && file.status !== 'processing' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5 hover:bg-background/80"
                                                            onClick={() => onFileRemove(file.key)}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="schema" className="mt-3">
                    <JsonSchemaEditor
                        value={localInputSchema}
                        onChange={handleSchemaChange}
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
    totalFileSize
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
}) => {
    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <h3 className="text-base font-semibold">Initial Payload</h3>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                        <HelpTooltip text="Payload is the JSON input to workflow execution. Editing here does NOT save values to the workflow; it only affects this session/run. Use Input Schema to optionally describe the expected structure for validation and tooling." />
                    </div>
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
                />
            </div>
        </Card>
    );
};

const MAX_DISPLAY_LINES = 3000;
export const FinalTransformMiniStepCard = ({ transform, responseSchema, onTransformChange, onResponseSchemaChange, readOnly, onExecuteTransform, isExecutingTransform, canExecute, transformResult, stepInputs }: { transform?: string; responseSchema?: string; onTransformChange?: (value: string) => void; onResponseSchemaChange?: (value: string) => void; readOnly?: boolean; onExecuteTransform?: (schema: string, transform: string) => void; isExecutingTransform?: boolean; canExecute?: boolean; transformResult?: any; stepInputs?: any; }) => {
    const [activeTab, setActiveTab] = useState('transform');
    const [localTransform, setLocalTransform] = useState(transform || '');
    const [localSchema, setLocalSchema] = useState(responseSchema || '');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    const [schemaInitialized, setSchemaInitialized] = useState(false);
    useEffect(() => { setLocalTransform(transform || ''); }, [transform]);
    useEffect(() => { if (!schemaInitialized) { setLocalSchema(responseSchema || ''); setSchemaInitialized(true); } }, [responseSchema, schemaInitialized]);
    useEffect(() => { const handleTabChange = () => { if (onTransformChange && localTransform !== transform) onTransformChange(localTransform); if (onResponseSchemaChange && localSchema !== responseSchema) onResponseSchemaChange(localSchema); }; handleTabChange(); }, [activeTab]);
    const handleTransformChange = (value: string) => { setLocalTransform(value); };
    const handleSchemaChange = (value: string | null) => { if (value === null) { setLocalSchema(''); if (onResponseSchemaChange) onResponseSchemaChange(''); } else { setLocalSchema(value); if (onResponseSchemaChange) onResponseSchemaChange(value); } };
    const ensureValidTransform = (code: string): string => {
        if (!code || !code.trim()) return `(sourceData) => {\n  return sourceData;\n}`;
        const arrowFunctionPattern = /^\s*\(\s*sourceData\s*\)\s*=>\s*\{[\s\S]*\}\s*;?\s*$/;
        if (arrowFunctionPattern.test(code)) return code;
        return `(sourceData) => {\n${code}\n}`;
    };
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
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-muted rounded-lg"><Code2 className="h-5 w-5 text-muted-foreground" /></div>
                        <div>
                            <h3 className="text-lg font-semibold">Final Transformation</h3>
                            <span className="text-xs text-muted-foreground">JavaScript Transform & Response Schema</span>
                        </div>
                    </div>
                    {!readOnly && onExecuteTransform && (
                        <div className="flex items-center gap-2">
                            <Button size="sm" onClick={handleExecuteTransform} disabled={!canExecute || isExecutingTransform} title={!canExecute ? "Execute all steps first" : isExecutingTransform ? "Transform is executing..." : "Test final transform"}>
                                {isExecutingTransform ? (<><div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />Running...</>) : (<><Play className="h-3 w-3 mr-1" />Run Transform</>)}
                            </Button>
                            <HelpTooltip text="Executes the final transform script with step results as input. If a response schema is enabled, the output will be validated against it." />
                        </div>
                    )}
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-3 mb-3">
                        <TabsTrigger value="inputs">Step Inputs</TabsTrigger>
                        <TabsTrigger value="transform">Transform Code</TabsTrigger>
                        <TabsTrigger value="schema">Response Schema</TabsTrigger>
                    </TabsList>
                    <TabsContent value="inputs" className="mt-2">
                        {(() => {
                            let inputString = '';
                            let isTruncated = false;
                            if (inputViewMode === 'schema') {
                                const schemaObj = inferJsonSchema(stepInputs || {});
                                inputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                            } else {
                                const displayData = truncateForDisplay(stepInputs);
                                inputString = displayData.value;
                                isTruncated = displayData.truncated;
                            }
                            const fullJson = stepInputs !== undefined ? JSON.stringify(stepInputs, null, 2) : '';
                            const bytes = stepInputs === undefined ? 0 : new Blob([fullJson]).size;
                            return (
                                <>
                                    <JsonCodeEditor value={inputString} readOnly={true} minHeight="150px" maxHeight="250px" resizable={true} overlay={<div className="flex items-center gap-2"><Tabs value={inputViewMode} onValueChange={(v) => setInputViewMode(v as 'preview' | 'schema')} className="w-auto"><TabsList className="h-6 rounded-md"><TabsTrigger value="preview" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger><TabsTrigger value="schema" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger></TabsList></Tabs><span className="text-[10px] text-muted-foreground">{bytes.toLocaleString()} bytes</span><CopyButton text={fullJson} /></div>} />
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
                            <JsonSchemaEditor value={(localSchema && localSchema.trim().length > 0) ? localSchema : null} onChange={handleSchemaChange} isOptional={true} />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </Card>
    );
};

export const MiniStepCard = ({ step, index, isActive, onClick, stepId, isPayload = false, isTransform = false, isFinal = false, isRunningAll = false, isTesting = false, completedSteps = [], failedSteps = [] }: { step: any; index: number; isActive: boolean; onClick: () => void; stepId?: string | null; isPayload?: boolean; isTransform?: boolean; isFinal?: boolean; isRunningAll?: boolean; isTesting?: boolean; completedSteps?: string[]; failedSteps?: string[]; }) => {
    if (isPayload) {
        return (
            <div className={cn("cursor-pointer transition-all duration-300 ease-out transform flex items-center", "opacity-90 hover:opacity-100 hover:scale-[1.01]")} onClick={onClick} style={{ height: '100%' }}>
                <Card className={cn(isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[228px] h-[120px]", "flex-shrink-0", isActive && "ring-2 ring-primary shadow-lg")}>
                    <div className="flex flex-col items-center justify-center h-full leading-tight">
                        <Package className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[11px] font-medium mt-0.5">Initial Payload</span>
                        <span className="text-[10px] text-muted-foreground -mt-0.5">JSON</span>
                    </div>
                </Card>
            </div>
        );
    }
    if (isTransform) {
        const isCompleted = completedSteps.includes('__final_transform__');
        const isFailed = failedSteps.includes('__final_transform__');
        const getStatusDotColor = () => {
            if (isTesting || isRunningAll) return "bg-yellow-500 animate-pulse";
            if (isFailed) return "bg-red-500";
            if (isCompleted) return "bg-green-500";
            return "bg-gray-400";
        };
        const getStatusLabel = () => {
            if (isTesting || isRunningAll) return "Running...";
            if (isFailed) return "Failed";
            if (isCompleted) return "Completed";
            return "Pending";
        };
        return (
            <div className={cn("cursor-pointer transition-all duration-300 ease-out transform", "opacity-90 hover:opacity-100 hover:scale-[1.01]")} onClick={onClick} style={{ height: '100%' }}>
                <Card className={cn(isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[228px] h-[120px]", "flex-shrink-0", isActive && "ring-2 ring-primary shadow-lg")}>
                    <div className="h-full flex flex-col justify-between">
                        <div className="flex-1 min-h-0 flex flex-col items-center justify-center leading-tight">
                            <Code2 className="h-5 w-5 text-muted-foreground" />
                            <span className="text-[11px] font-medium mt-0.5">Final Transform</span>
                            <span className="text-[10px] text-muted-foreground -mt-0.5">JavaScript</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                            <div className={cn("w-2 h-2 rounded-full transition-all", getStatusDotColor())} />
                            <span className="text-xs text-muted-foreground">{getStatusLabel()}</span>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }
    if (isFinal) {
        return (
            <div className={cn("cursor-pointer transition-all duration-300 ease-out transform flex items-center", "opacity-90 hover:opacity-100 hover:scale-[1.01]")} onClick={onClick} style={{ height: '100%' }}>
                <Card className={cn(isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[228px] h-[120px]", "flex-shrink-0", isActive && "ring-2 ring-primary shadow-lg")}>
                    <div className="flex flex-col items-center justify-center h-full leading-tight">
                        <FileJson className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[11px] font-medium mt-0.5">Workflow Result</span>
                        <span className="text-[10px] text-muted-foreground -mt-0.5">JSON</span>
                    </div>
                </Card>
            </div>
        );
    }
    const method = step.apiConfig?.method || 'GET';
    const url = `${step.apiConfig?.urlHost || ''}${step.apiConfig?.urlPath || ''}`.trim() || 'No URL';
    const isCompleted = stepId ? completedSteps.includes(stepId) : false;
    const isFailed = stepId ? failedSteps.includes(stepId) : false;
    const getStatusDotColor = () => {
        if (isTesting || (isRunningAll && stepId)) return "bg-yellow-500 animate-pulse";
        if (isFailed) return "bg-red-500";
        if (isCompleted) return "bg-green-500";
        return "bg-gray-400";
    };
    const getStatusLabel = () => {
        if (isTesting || (isRunningAll && stepId)) return "Running...";
        if (isFailed) return "Failed";
        if (isCompleted) return "Completed";
        return "Pending";
    };
    return (
        <div className={cn("cursor-pointer transition-all duration-300 ease-out transform", "opacity-90 hover:opacity-100 hover:scale-[1.01]")} onClick={onClick}>
            <Card className={cn(isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[228px] h-[120px]", "flex-shrink-0", isActive && "ring-2 ring-primary shadow-lg")}>
                <div className="h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">{index}</div>
                        <span className={cn("text-xs px-2 py-1 rounded font-medium", method === 'GET' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", method === 'POST' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", method === 'PUT' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", method === 'DELETE' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", !['GET', 'POST', 'PUT', 'DELETE'].includes(method) && "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400")}>{method}</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <p className="text-sm font-semibold truncate">{step.id || `Step ${index}`}</p>
                        <p className="text-xs text-muted-foreground truncate">{url}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                        <div className={cn("w-2 h-2 rounded-full transition-all", getStatusDotColor())} />
                        <span className="text-xs text-muted-foreground">{getStatusLabel()}</span>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export { truncateForDisplay, truncateLines };



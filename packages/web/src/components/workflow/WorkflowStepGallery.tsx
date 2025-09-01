import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import JsonSchemaEditor from '@/src/components/utils/JsonSchemaEditor';
import { canExecuteStep } from '@/src/lib/client-utils';
import { cn } from '@/src/lib/utils';
import { Integration } from "@superglue/client";
import { Check, ChevronLeft, ChevronRight, Code2, Copy, Database, Eye, FileJson, Package, Pencil, Play, Settings, Trash2, X } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import React, { useEffect, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { WorkflowStepCard } from './WorkflowStepCard';

interface WorkflowStepGalleryProps {
    steps: any[];
    stepResults?: Record<string, any>;
    finalTransform?: string;
    finalResult?: any;
    responseSchema?: string;
    workflowId?: string;
    instruction?: string;
    onStepsChange?: (steps: any[]) => void;
    onStepEdit?: (stepId: string, updatedStep: any) => void;
    onFinalTransformChange?: (transform: string) => void;
    onResponseSchemaChange?: (schema: string) => void;
    onPayloadChange?: (payload: string) => void;
    onWorkflowIdChange?: (id: string) => void;
    onInstructionEdit?: () => void;
    onExecuteStep?: (stepIndex: number) => Promise<void>;
    onExecuteAllSteps?: () => Promise<void>;
    onExecuteTransform?: () => Promise<void>;
    completedSteps?: string[];
    failedSteps?: string[];
    integrations?: Integration[];
    isExecuting?: boolean;
    isExecutingStep?: number;
    isExecutingTransform?: boolean;
    transformResult?: any;
    readOnly?: boolean;
    payload?: any;
    inputSchema?: string;
    onInputSchemaChange?: (schema: string) => void;
    headerActions?: React.ReactNode;
    navigateToFinalSignal?: number;
}

const MAX_HIGHLIGHT_CHARS = 200000;
const highlightCode = (code: string, language: string) => {
    if (!code || code.length > MAX_HIGHLIGHT_CHARS) return code;
    try {
        if (language === 'javascript' || language === 'js') {
            // Ensure we're using the JavaScript language definition
            const jsLang = Prism.languages.javascript || Prism.languages.js;
            if (jsLang) {
                return Prism.highlight(code, jsLang, 'javascript');
            }
        } else if (language === 'json') {
            const jsonLang = Prism.languages.json;
            if (jsonLang) {
                return Prism.highlight(code, jsonLang, 'json');
            }
        }
        return code;
    } catch (error) {
        console.error('Syntax highlighting error:', error);
        return code;
    }
};

// Helper to infer JSON schema from data
const inferSchema = (data: any): any => {
    if (data === null || data === undefined) return { type: 'null' };

    if (Array.isArray(data)) {
        return {
            type: 'array',
            items: data.length > 0 ? inferSchema(data[0]) : { type: 'any' }
        };
    }

    if (typeof data === 'object') {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        Object.keys(data).forEach(key => {
            properties[key] = inferSchema(data[key]);
            if (data[key] !== null && data[key] !== undefined) {
                required.push(key);
            }
        });

        return {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {})
        };
    }

    return { type: typeof data };
};

// Size-based truncation for display (1MB limit)
const MAX_DISPLAY_SIZE = 1024 * 1024; // 1MB
const MAX_DISPLAY_LINES = 10000; // Max lines to display

const truncateForDisplay = (data: any): { value: string, truncated: boolean } => {
    if (data === null || data === undefined) {
        return { value: '{}', truncated: false };
    }

    try {
        const fullJson = JSON.stringify(data, null, 2);

        // Check if data is too large
        if (fullJson.length > MAX_DISPLAY_SIZE) {
            // Try to show a reasonable portion
            const truncatedString = fullJson.substring(0, MAX_DISPLAY_SIZE);
            // Find the last complete line
            const lastNewline = truncatedString.lastIndexOf('\n');
            const cleanTruncated = truncatedString.substring(0, lastNewline > 0 ? lastNewline : MAX_DISPLAY_SIZE);
            return {
                value: cleanTruncated + '\n\n... [Data truncated for display - too large]',
                truncated: true
            };
        }

        // Check line count
        const lines = fullJson.split('\n');
        if (lines.length > MAX_DISPLAY_LINES) {
            return {
                value: lines.slice(0, MAX_DISPLAY_LINES).join('\n') + '\n\n... [Data truncated - too many lines]',
                truncated: true
            };
        }

        return { value: fullJson, truncated: false };
    } catch (e) {
        // Fallback for circular references or other issues
        return { value: String(data), truncated: false };
    }
};



const truncateLines = (text: string, maxLines: number): string => {
    if (!text) return text;
    const lines = text.split('\n');
    if (lines.length <= maxLines) return text;
    return lines.slice(0, maxLines).join('\n') + `\n... truncated ${lines.length - maxLines} more lines ...`;
};

// Helper to merge payload with step results progressively
const buildEvolvingPayload = (initialPayload: any, steps: any[], stepResults: Record<string, any>, upToIndex: number) => {
    let evolvingPayload = { ...initialPayload };

    for (let i = 0; i <= upToIndex && i < steps.length; i++) {
        const step = steps[i];
        const result = stepResults[step.id];
        if (result) {
            // Merge step result into evolving payload
            evolvingPayload = {
                ...evolvingPayload,
                [`${step.id}`]: result
            };
        }
    }

    return evolvingPayload;
};

// Copy button component
const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <button
            onClick={handleCopy}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-background/80 transition-colors bg-background/60 backdrop-blur"
            title="Copy"
            type="button"
        >
            {copied ? (
                <Check className="h-3 w-3 text-green-600" />
            ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
            )}
        </button>
    );
};

// Instruction Display Component with truncation and modal
const InstructionDisplay = ({
    instruction,
    onEdit,
    showEditButton = true
}: {
    instruction: string;
    onEdit?: () => void;
    showEditButton?: boolean;
}) => {
    const [showFull, setShowFull] = useState(false);
    const [copied, setCopied] = useState(false);
    const MAX_LENGTH = 100;
    const truncated = instruction.length > MAX_LENGTH
        ? instruction.substring(0, MAX_LENGTH) + '...'
        : instruction;

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
                    <p className="text-sm font-mono text-foreground truncate flex-1">
                        {truncated}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {instruction.length > MAX_LENGTH && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setShowFull(true)}
                            title="View full instruction"
                        >
                            <Eye className="h-3 w-3" />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleCopy}
                        title="Copy"
                    >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    {onEdit && showEditButton && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={onEdit}
                            title="Edit"
                        >
                            <Pencil className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Full Instruction Modal */}
            {showFull && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowFull(false)}>
                    <Card className="max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 relative">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Workflow Instruction</h3>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                            navigator.clipboard.writeText(instruction);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 1500);
                                        }}
                                        title="Copy"
                                    >
                                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setShowFull(false)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                                <p className="text-sm font-mono whitespace-pre-wrap">
                                    {instruction}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </>
    );
};

// Final Results Card with size-based truncation
const FinalResultsCard = ({ result }: { result: any }) => {
    const [copied, setCopied] = useState(false);

    // Get truncated display and full data separately
    const displayData = truncateForDisplay(result);
    const fullJson = result ? JSON.stringify(result, null, 2) : '{}';
    const bytes = new Blob([fullJson]).size;

    const handleCopy = () => {
        // Always copy the full result, never truncated
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
                        <span className="text-xs text-muted-foreground">{bytes.toLocaleString()} bytes</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleCopy}
                            title="Copy full result"
                        >
                            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>
                <div className="relative">
                    <JsonCodeEditor
                        value={displayData.value}
                        readOnly
                        minHeight="220px"
                        maxHeight="420px"
                    />
                </div>
                {displayData.truncated && (
                    <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                        Preview truncated for performance. Use copy button to get full data.
                    </div>
                )}
            </div>
        </Card>
    );
};



// JavaScript Code Editor Component with proper syntax highlighting
const JavaScriptCodeEditor = ({
    value,
    onChange,
    readOnly = false,
    minHeight = '200px',
    maxHeight = '350px',
    showCopy = true
}: {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    showCopy?: boolean;
}) => {
    const lines = (value || '').split('\n');

    return (
        <div className="relative bg-muted/50 dark:bg-muted/20 rounded-lg border font-mono shadow-sm js-code-editor">
            {showCopy && (
                <div className="absolute top-1 right-1 z-10">
                    <CopyButton text={value || ''} />
                </div>
            )}
            <div className="absolute left-0 top-0 bottom-0 w-10 bg-muted/30 border-r rounded-l-lg overflow-hidden">
                <div className="flex flex-col py-2" style={{ maxHeight, overflow: 'auto' }}>
                    {lines.map((_, i) => (
                        <div key={i} className="text-[10px] text-muted-foreground text-right pr-2 leading-[18px] select-none">
                            {i + 1}
                        </div>
                    ))}
                </div>
            </div>
            <div className="pl-12 pr-3 py-2 overflow-auto" style={{ maxHeight }}>
                <Editor
                    value={value || ''}
                    onValueChange={onChange || (() => { })}
                    highlight={(code) => {
                        try {
                            return Prism.highlight(code, Prism.languages.javascript, 'javascript');
                        } catch {
                            return code;
                        }
                    }}
                    padding={0}
                    disabled={readOnly}
                    className="font-mono text-[11px] leading-[18px]"
                    textareaClassName="outline-none focus:outline-none"
                    style={{
                        minHeight,
                        background: 'transparent',
                        lineHeight: '18px'
                    }}
                />
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
        </div>
    );
};

// JSON Code Editor without blue border
const MAX_READONLY_RENDER_CHARS = 150000;
const JsonCodeEditor = ({
    value,
    onChange,
    readOnly = false,
    minHeight = '150px',
    maxHeight = '400px',
    placeholder = '{}',
    overlay
}: {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    placeholder?: string;
    overlay?: React.ReactNode;
}) => {
    const displayValue = React.useMemo(() => {
        const base = value || placeholder;
        if (readOnly && (base?.length || 0) > MAX_READONLY_RENDER_CHARS) {
            return `${base.slice(0, MAX_READONLY_RENDER_CHARS)}\n...truncated...`;
        }
        return base;
    }, [value, placeholder, readOnly]);

    return (
        <div className={cn(
            "relative rounded-lg border shadow-sm",
            readOnly ? "bg-muted/30 border-dashed" : "bg-background border"
        )}>
            {overlay && (
                <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
                    {overlay}
                </div>
            )}
            {!overlay && (
                <div className="absolute top-1 right-1 z-10">
                    <CopyButton text={value || placeholder} />
                </div>
            )}
            <div className={cn(
                "p-3 pr-10 overflow-auto",
                readOnly ? "cursor-not-allowed" : "cursor-text"
            )} style={{ maxHeight }}>
                <Editor
                    value={displayValue}
                    onValueChange={onChange || (() => { })}
                    highlight={(code) => highlightCode(code, 'json')}
                    padding={0}
                    disabled={readOnly}
                    className="font-mono text-xs"
                    textareaClassName="outline-none focus:outline-none"
                    style={{
                        minHeight,
                        background: 'transparent',
                    }}
                />
            </div>
        </div>
    );
};

// Initial Payload Card with Input Schema - compact version with tabs
const PayloadCard = ({
    payload,
    inputSchema,
    onChange,
    onInputSchemaChange,
    readOnly
}: {
    payload: any;
    inputSchema?: string;
    onChange?: (value: string) => void;
    onInputSchemaChange?: (value: string) => void;
    readOnly?: boolean;
}) => {
    const [activeTab, setActiveTab] = useState('payload');
    const [localPayload, setLocalPayload] = useState(() =>
        payload ? JSON.stringify(payload, null, 2) : '{}'
    );
    const [localInputSchema, setLocalInputSchema] = useState(inputSchema || '{"type": "object", "properties": {"payload": {"type": "object"}}}');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLocalPayload(payload ? JSON.stringify(payload, null, 2) : '{}');
    }, [payload]);

    useEffect(() => {
        setLocalInputSchema(inputSchema || '{"type": "object", "properties": {"payload": {"type": "object"}}}');
    }, [inputSchema]);

    const handlePayloadChange = (value: string) => {
        setLocalPayload(value);
        try {
            JSON.parse(value);
            setError(null);
            if (onChange) {
                onChange(value);
            }
        } catch (e) {
            setError('Invalid JSON');
        }
    };

    const handleSchemaChange = (value: string | null) => {
        if (value === null) {
            // Schema editor is disabled
            setLocalInputSchema('{"type": "object", "properties": {"payload": {"type": "object"}}}');
            if (onInputSchemaChange) {
                onInputSchemaChange('{"type": "object", "properties": {"payload": {"type": "object"}}}');
            }
        } else {
            setLocalInputSchema(value);
            if (onInputSchemaChange) {
                onInputSchemaChange(value);
            }
        }
    };

    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <h3 className="text-base font-semibold">Initial Payload</h3>
                        <span className="text-[10px] text-muted-foreground">Input Data & Schema</span>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2 mb-3 h-8">
                        <TabsTrigger value="payload" className="text-xs">Payload JSON</TabsTrigger>
                        <TabsTrigger value="schema" className="text-xs">Input Schema</TabsTrigger>
                    </TabsList>

                    <TabsContent value="payload" className="mt-3">
                        <JsonCodeEditor
                            value={localPayload}
                            onChange={handlePayloadChange}
                            readOnly={readOnly}
                            minHeight="150px"
                            maxHeight="200px"
                        />
                        {error && (
                            <div className="mt-2 text-xs text-destructive flex items-center gap-1">
                                <span className="text-destructive">⚠</span> {error}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="schema" className="mt-3">
                        <JsonSchemaEditor
                            value={localInputSchema === '{"type": "object", "properties": {"payload": {"type": "object"}}}' ? null : localInputSchema}
                            onChange={handleSchemaChange}
                            isOptional={true}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </Card>
    );
};

const FinalTransformCard = ({
    transform,
    responseSchema,
    onTransformChange,
    onResponseSchemaChange,
    readOnly,
    onExecuteTransform,
    isExecuting,
    canExecute,
    transformResult
}: {
    transform?: string;
    responseSchema?: string;
    onTransformChange?: (value: string) => void;
    onResponseSchemaChange?: (value: string) => void;
    readOnly?: boolean;
    onExecuteTransform?: () => void;
    isExecuting?: boolean;
    canExecute?: boolean;
    transformResult?: any;
}) => {
    const [activeTab, setActiveTab] = useState('transform');
    const [localTransform, setLocalTransform] = useState(transform || '');
    const [localSchema, setLocalSchema] = useState(responseSchema || '{"type": "object"}');

    useEffect(() => {
        setLocalTransform(transform || '');
    }, [transform]);

    useEffect(() => {
        setLocalSchema(responseSchema || '{"type": "object"}');
    }, [responseSchema]);

    const handleTransformChange = (value: string) => {
        setLocalTransform(value);
        if (onTransformChange) {
            onTransformChange(value);
        }
    };

    const handleSchemaChange = (value: string | null) => {
        if (value === null) {
            // Schema editor is disabled
            setLocalSchema('{"type": "object"}');
            if (onResponseSchemaChange) {
                onResponseSchemaChange('{"type": "object"}');
            }
        } else {
            setLocalSchema(value);
            if (onResponseSchemaChange) {
                onResponseSchemaChange(value);
            }
        }
    };

    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-muted rounded-lg">
                            <Code2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">Final Transformation</h3>
                            <span className="text-xs text-muted-foreground">JavaScript Transform & Response Schema</span>
                        </div>
                    </div>
                    {!readOnly && onExecuteTransform && (
                        <Button
                            variant="success"
                            size="sm"
                            onClick={onExecuteTransform}
                            disabled={!canExecute || isExecuting}
                            title={!canExecute ? "Execute all steps first" : "Test final transform"}
                        >
                            {isExecuting ? (
                                <>
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                                    Testing...
                                </>
                            ) : (
                                <>
                                    <Play className="h-3 w-3 mr-1" />
                                    Test Transform
                                </>
                            )}
                        </Button>
                    )}
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2 mb-3">
                        <TabsTrigger value="transform">Transform Code</TabsTrigger>
                        <TabsTrigger value="schema">Response Schema</TabsTrigger>
                    </TabsList>

                    <TabsContent value="transform" className="mt-2">
                        <JavaScriptCodeEditor
                            value={localTransform}
                            onChange={handleTransformChange}
                            readOnly={readOnly}
                            minHeight="150px"
                            maxHeight="250px"
                        />
                    </TabsContent>

                    <TabsContent value="schema" className="mt-2">
                        <div className="space-y-3">
                            <JsonSchemaEditor
                                value={localSchema === '{"type": "object"}' ? null : localSchema}
                                onChange={handleSchemaChange}
                                isOptional={true}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </Card>
    );
};

// Spotlight Step Card with toggleable sections
const SpotlightStepCard = ({
    step,
    stepIndex,
    evolvingPayload,
    stepResult,
    onEdit,
    onRemove,
    onExecuteStep,
    canExecute,
    isExecuting,
    integrations,
    readOnly,
    failedSteps = []
}: {
    step: any;
    stepIndex: number;
    evolvingPayload: any;
    stepResult?: any;
    onEdit?: (stepId: string, updatedStep: any) => void;
    onRemove?: (stepId: string) => void;
    onExecuteStep?: () => Promise<void>;
    canExecute?: boolean;
    isExecuting?: boolean;
    integrations?: Integration[];
    readOnly?: boolean;
    failedSteps?: string[];
    stepResultsMap?: Record<string, any>;
}) => {
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');

    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md bg-accent/10 dark:bg-accent/5 border border-accent/30 dark:border-accent/20">
            <div className="p-3">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">
                            {step.id || `Step ${stepIndex + 1}`}
                        </h3>
                        {step.name && step.name !== step.id && (
                            <span className="text-sm text-muted-foreground">({step.name})</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!readOnly && onExecuteStep && (
                            <Button
                                variant="success"
                                size="sm"
                                onClick={onExecuteStep}
                                disabled={!canExecute || isExecuting}
                                title={!canExecute ? "Execute previous steps first" : "Test this step (no self-healing)"}
                            >
                                {isExecuting ? (
                                    <>
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-3 w-3 mr-1" />
                                        Test Step
                                    </>
                                )}
                            </Button>
                        )}
                        {!readOnly && onRemove && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onRemove(step.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Tabs value={activePanel} onValueChange={(v) => setActivePanel(v as 'input' | 'config' | 'output')}>
                            <TabsList className="h-8 rounded-md">
                                <TabsTrigger value="input" className="h-8 px-3 text-xs flex items-center gap-1 rounded-md data-[state=active]:rounded-md">
                                    <FileJson className="h-4 w-4" /> Step Input
                                </TabsTrigger>
                                <TabsTrigger value="config" className="h-8 px-3 text-xs flex items-center gap-1 rounded-md data-[state=active]:rounded-md">
                                    <Settings className="h-4 w-4" /> Step Config
                                </TabsTrigger>
                                <TabsTrigger value="output" className="h-8 px-3 text-xs flex items-center gap-1 rounded-md data-[state=active]:rounded-md">
                                    <Package className="h-4 w-4" /> Step Output
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        {/* Removed secondary Run Step button; keep only Test Step above */}
                    </div>

                    {activePanel === 'input' && (
                        <div>
                            {(() => {
                                let inputString = '';
                                let isTruncated = false;
                                if (inputViewMode === 'schema') {
                                    const schemaObj = inferSchema(evolvingPayload || {});
                                    inputString = truncateLines(JSON.stringify(schemaObj, null, 2), 1000);
                                } else {
                                    const displayData = truncateForDisplay(evolvingPayload);
                                    inputString = displayData.value;
                                    isTruncated = displayData.truncated;
                                }
                                return (
                                    <>
                                        <JsonCodeEditor
                                            value={inputString}
                                            readOnly={true}
                                            minHeight="60px"
                                            maxHeight="120px"
                                            overlay={
                                                <Tabs value={inputViewMode} onValueChange={(v) => setInputViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                    <TabsList className="h-6 rounded-md">
                                                        <TabsTrigger value="preview" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger>
                                                        <TabsTrigger value="schema" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger>
                                                    </TabsList>
                                                </Tabs>
                                            }
                                        />
                                        {isTruncated && inputViewMode === 'preview' && (
                                            <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                                                Preview truncated for performance
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {activePanel === 'config' && (
                        <div className="mt-1">
                            <WorkflowStepCard
                                step={step}
                                isLast={true}
                                onEdit={onEdit}
                                onRemove={() => { }}
                                integrations={integrations}
                            />
                        </div>
                    )}

                    {activePanel === 'output' && (
                        <div>
                            {(() => {
                                // Check if step has failed and we should show error
                                const stepFailed = failedSteps?.includes(step.id);
                                const errorResult = stepFailed && (!stepResult || typeof stepResult === 'string');

                                let outputString = '';
                                let isTruncated = false;
                                if (errorResult) {
                                    // Show error message if step failed
                                    outputString = stepResult ?
                                        (typeof stepResult === 'string' ? stepResult : JSON.stringify(stepResult, null, 2)) :
                                        '{\n  "error": "Step execution failed"\n}';
                                } else if (outputViewMode === 'schema') {
                                    const schemaObj = inferSchema(stepResult || {});
                                    outputString = truncateLines(JSON.stringify(schemaObj, null, 2), 1000);
                                } else {
                                    const displayData = truncateForDisplay(stepResult);
                                    outputString = displayData.value;
                                    isTruncated = displayData.truncated;
                                }
                                return (
                                    <>
                                        {stepFailed && (
                                            <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                                                <p className="text-xs text-destructive">Step execution failed</p>
                                            </div>
                                        )}
                                        <JsonCodeEditor
                                            value={outputString}
                                            readOnly={true}
                                            minHeight="60px"
                                            maxHeight="120px"
                                            overlay={
                                                !errorResult && (
                                                    <Tabs value={outputViewMode} onValueChange={(v) => setOutputViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                        <TabsList className="h-6 rounded-md">
                                                            <TabsTrigger value="preview" className="h-6 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger>
                                                            <TabsTrigger value="schema" className="h-6 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger>
                                                        </TabsList>
                                                    </Tabs>
                                                )
                                            }
                                        />
                                        {isTruncated && outputViewMode === 'preview' && (
                                            <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                                                Preview truncated for performance
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
};

// Enhanced Mini Step Card
const MiniStepCard = ({
    step,
    index,
    isActive,
    onClick,
    stepId,
    isPayload = false,
    isTransform = false,
    isFinal = false,
    isRunningAll = false,
    isTesting = false,
    completedSteps = [],
    failedSteps = []
}: {
    step: any;
    index: number;
    isActive: boolean;
    onClick: () => void;
    stepId?: string | null;
    isPayload?: boolean;
    isTransform?: boolean;
    isFinal?: boolean;
    isRunningAll?: boolean;
    isTesting?: boolean;
    completedSteps?: string[];
    failedSteps?: string[];
}) => {
    if (isPayload) {
        return (
            <div
                className={cn(
                    "cursor-pointer transition-all duration-300 ease-out transform flex items-center",
                    "opacity-90 hover:opacity-100 hover:scale-[1.01]"
                )}
                onClick={onClick}
                style={{ height: '100%' }}
            >
                <Card className={cn(
                    isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[220px] h-[120px]",
                    "flex-shrink-0",
                    isActive && "ring-2 ring-primary shadow-lg"
                )}>
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
            if (isFailed) return "bg-red-500";
            if (isCompleted) return "bg-green-500";
            if (isRunningAll) return "bg-yellow-500 animate-pulse";
            return "bg-gray-400";
        };
        const getStatusLabel = () => {
            if (isFailed) return "Failed";
            if (isCompleted) return "Completed";
            if (isTesting) return "Testing...";
            if (isRunningAll) return "Testing...";
            return "Pending";
        };
        return (
            <div
                className={cn(
                    "cursor-pointer transition-all duration-300 ease-out transform",
                    "opacity-90 hover:opacity-100 hover:scale-[1.01]"
                )}
                onClick={onClick}
                style={{ height: '100%' }}
            >
                <Card className={cn(
                    isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[220px] h-[120px]",
                    "flex-shrink-0",
                    isActive && "ring-2 ring-primary shadow-lg"
                )}>
                    <div className="h-full flex flex-col justify-between">
                        <div className="flex-1 min-h-0 flex flex-col items-center justify-center leading-tight">
                            <Code2 className="h-5 w-5 text-muted-foreground" />
                            <span className="text-[11px] font-medium mt-0.5">Final Transform</span>
                            <span className="text-[10px] text-muted-foreground -mt-0.5">JavaScript</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                            <div className={cn(
                                "w-2 h-2 rounded-full transition-all",
                                getStatusDotColor()
                            )} />
                            <span className="text-xs text-muted-foreground">{getStatusLabel()}</span>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    if (isFinal) {
        return (
            <div
                className={cn(
                    "cursor-pointer transition-all duration-300 ease-out transform flex items-center",
                    "opacity-90 hover:opacity-100 hover:scale-[1.01]"
                )}
                onClick={onClick}
                style={{ height: '100%' }}
            >
                <Card className={cn(
                    isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[220px] h-[120px]",
                    "flex-shrink-0",
                    isActive && "ring-2 ring-primary shadow-lg"
                )}>
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

    // Determine status dot color
    const isCompleted = stepId ? completedSteps.includes(stepId) : false;
    const isFailed = stepId ? failedSteps.includes(stepId) : false;
    const getStatusDotColor = () => {
        if (isFailed) return "bg-red-500";
        if (isCompleted) return "bg-green-500";
        if (isTesting) return "bg-yellow-500 animate-pulse";
        if (isRunningAll && stepId) return "bg-yellow-500 animate-pulse";
        return "bg-gray-400";
    };
    const getStatusLabel = () => {
        if (isFailed) return "Failed";
        if (isCompleted) return "Completed";
        if (isTesting || (isRunningAll && stepId)) return "Testing...";
        return "Pending";
    };

    return (
        <div
            className={cn(
                "cursor-pointer transition-all duration-300 ease-out transform",
                "opacity-90 hover:opacity-100 hover:scale-[1.01]"
            )}
            onClick={onClick}
        >
            <Card className={cn(
                isActive ? "p-4 w-[228px] h-[130px]" : "p-4 w-[220px] h-[120px]",
                "flex-shrink-0",
                isActive && "ring-2 ring-primary shadow-lg"
            )}>
                <div className="h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                            {index}
                        </div>
                        <span className={cn(
                            "text-xs px-2 py-1 rounded font-medium",
                            method === 'GET' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                            method === 'POST' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                            method === 'PUT' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                            method === 'DELETE' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            !['GET', 'POST', 'PUT', 'DELETE'].includes(method) && "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                        )}>
                            {method}
                        </span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <p className="text-sm font-semibold truncate">
                            {step.id || `Step ${index}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                            {url}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                        <div className={cn(
                            "w-2 h-2 rounded-full transition-all",
                            getStatusDotColor()
                        )} />
                        <span className="text-xs text-muted-foreground">{getStatusLabel()}</span>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export function WorkflowStepGallery({
    steps,
    stepResults = {},
    finalTransform,
    finalResult,
    responseSchema,
    workflowId,
    instruction,
    onStepsChange,
    onStepEdit: originalOnStepEdit,
    onFinalTransformChange,
    onResponseSchemaChange,
    onPayloadChange,
    onWorkflowIdChange,
    onInstructionEdit,
    onExecuteStep,
    onExecuteAllSteps,
    onExecuteTransform,
    completedSteps = [],
    failedSteps = [],
    integrations,
    isExecuting,
    isExecutingStep,
    isExecutingTransform,
    transformResult,
    readOnly = false,
    payload,
    inputSchema,
    onInputSchemaChange,
    headerActions,
    navigateToFinalSignal
}: WorkflowStepGalleryProps) {
    const [activeIndex, setActiveIndex] = useState(1); // Default to first workflow step, not payload
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [containerWidth, setContainerWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const trackRef = useState<HTMLElement | null>(null)[0] as unknown as React.MutableRefObject<HTMLDivElement | null> || { current: null } as any;
    const listRef = useRef<HTMLDivElement | null>(null);

    // Update window width on resize
    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Observe container width (e.g., when logs panel opens/closes) to responsively adjust cards
    useEffect(() => {
        const container = listRef.current?.parentElement?.parentElement as HTMLElement | null;
        if (!container || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = (entry.contentRect?.width || container.getBoundingClientRect().width);
                if (w && Math.abs(w - containerWidth) > 1) setContainerWidth(w);
            }
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, [listRef.current, containerWidth]);

    // Convert stepResults array to object if needed
    const stepResultsMap = Array.isArray(stepResults)
        ? stepResults.reduce((acc: Record<string, any>, result: any) => {
            if (result.stepId) {
                acc[result.stepId] = result.data || result.transformedData || result;
            }
            return acc;
        }, {})
        : stepResults;

    // Build the complete workflow items including payload card
    const workflowItems = [
        // Initial payload card
        {
            type: 'payload',
            data: { payload, inputSchema },
            stepResult: undefined,
            evolvingPayload: payload || {}
        },
        // Regular steps
        ...steps.map((step, index) => ({
            type: 'step',
            data: step,
            stepResult: stepResultsMap[step.id],
            evolvingPayload: buildEvolvingPayload(payload || {}, steps, stepResultsMap, index - 1)
        })),
        // Final transform if exists
        ...(finalTransform !== undefined ? [{
            type: 'transform',
            data: { transform: finalTransform, responseSchema },
            stepResult: finalResult,
            evolvingPayload: buildEvolvingPayload(payload || {}, steps, stepResultsMap, steps.length - 1)
        }] : []),
        // Final result spotlight card (always present)
        {
            type: 'final',
            data: { result: finalResult },
            stepResult: finalResult,
            evolvingPayload: buildEvolvingPayload(payload || {}, steps, stepResultsMap, steps.length)
        }
    ];

    // Compute current item
    const currentItem = workflowItems[activeIndex];

    // Indices for indicator dots: one per mini card (payload + steps + transform + final)
    const indicatorIndices = workflowItems.map((_, idx) => idx);

    const handleNavigation = (direction: 'prev' | 'next') => {
        const newIndex = direction === 'prev'
            ? Math.max(0, activeIndex - 1)
            : Math.min(workflowItems.length - 1, activeIndex + 1);

        // Add a small delay to make the transition feel smoother
        setTimeout(() => {
            setActiveIndex(newIndex);
            // Snap the new active card into view
            const container = listRef.current;
            const card = container?.children?.[newIndex] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }, 50);
    };

    const handleCardClick = (globalIndex: number) => {
        // Close spotlight toggles to reduce jumpiness
        // reset spotlight state for next render
        // note: spotlight state is local to SpotlightStepCard; ensure future mounts default closed
        // Smoothly select and center the card
        setTimeout(() => {
            setActiveIndex(globalIndex);
            const container = listRef.current;
            const card = container?.children?.[globalIndex] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }, 50);
    };

    const handleRemoveStep = (stepId: string) => {
        if (!onStepsChange) return;
        const newSteps = steps.filter(step => step.id !== stepId);
        onStepsChange(newSteps);
        // Adjust active index if needed
        if (activeIndex >= workflowItems.length - 1) {
            setActiveIndex(Math.max(0, activeIndex - 1));
        }
    };

    // Wrap onStepEdit to reset completion status when a step is edited
    const onStepEdit = (stepId: string, updatedStep: any) => {
        if (originalOnStepEdit) {
            originalOnStepEdit(stepId, updatedStep);
            // The parent component should handle resetting the completion status
            // by clearing the stepId from completedSteps array
        }
    };

    // Auto-select first workflow step on mount (index 1, not 0 which is payload)
    useEffect(() => {
        setActiveIndex(steps.length > 0 ? 1 : 0);
    }, []);

    // Navigate to final card when requested
    useEffect(() => {
        if (navigateToFinalSignal) {
            setActiveIndex(workflowItems.length - 1);
            const container = listRef.current;
            const card = container?.children?.[workflowItems.length - 1] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigateToFinalSignal]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-3">
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 w-full">
                        {(onWorkflowIdChange || typeof workflowId !== 'undefined') && (
                            <div className="flex w-full items-center justify-between gap-3">
                                <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/50 rounded-md border h-[36px]">
                                    <span className="text-sm text-muted-foreground">Workflow ID:</span>
                                    <Input
                                        value={workflowId ?? ''}
                                        onChange={(e) => onWorkflowIdChange?.(e.target.value)}
                                        className="h-5 font-mono text-sm w-[200px] md:w-[280px] border-0 bg-transparent p-0 focus:ring-0"
                                        readOnly={readOnly || !onWorkflowIdChange}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    {headerActions ?? null}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {instruction && (
                    <div className="w-full">
                        <InstructionDisplay
                            instruction={instruction}
                            onEdit={onInstructionEdit}
                            showEditButton={!readOnly && !!onInstructionEdit}
                        />
                    </div>
                )}

                {/* Navigation Controls with scroll-snap carousel */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleNavigation('prev')}
                        disabled={activeIndex === 0}
                        className="shrink-0 h-9 w-9"
                        title="Previous"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {/* Card gallery - fully responsive to width */}
                    <div className="flex-1 overflow-hidden px-2 sm:px-4 md:px-6 lg:px-8 xl:px-10 2xl:px-12">
                        <div className="relative">
                            <div
                                ref={listRef}
                                className="flex gap-2 justify-center items-center overflow-visible py-3"
                                style={{ minHeight: '150px' }}
                            >
                                {(() => {
                                    // Calculate which 3 cards to show
                                    const totalCards = workflowItems.length;
                                    let startIdx = 0;
                                    let endIdx = totalCards;
                                    // Compute how many cards fit based on a minimum card width and gutter
                                    const MIN_CARD_WIDTH = 220; // px
                                    const GUTTER = 8; // px
                                    const cardsToShow = Math.max(1, Math.min(workflowItems.length, Math.floor(((containerWidth || windowWidth) + GUTTER) / (MIN_CARD_WIDTH + GUTTER))));

                                    // Calculate the range of cards to display
                                    if (totalCards <= cardsToShow) {
                                        // Show all cards if we have fewer than cardsToShow
                                        startIdx = 0;
                                        endIdx = totalCards;
                                    } else {
                                        // Center the active card within the visible window
                                        const halfWindow = Math.floor(cardsToShow / 2);
                                        startIdx = Math.max(0, Math.min(activeIndex - halfWindow, totalCards - cardsToShow));
                                        endIdx = startIdx + cardsToShow;
                                    }

                                    const visibleItems = workflowItems.slice(startIdx, endIdx);
                                    const visibleIndices = visibleItems.map((_, i) => startIdx + i);
                                    const hasHiddenLeft = startIdx > 0;
                                    const hasHiddenRight = endIdx < totalCards;

                                    return (
                                        <>
                                            {/* Left indicator - positioned between left arrow and first card */}
                                            {hasHiddenLeft && null}

                                            {/* Cards with Arrows */}
                                            {visibleItems.map((item, idx) => {
                                                const globalIdx = visibleIndices[idx];
                                                const showArrow = idx < visibleItems.length - 1;
                                                return (
                                                    <React.Fragment key={globalIdx}>
                                                        <div
                                                            className="flex items-center justify-center px-1"
                                                            style={{
                                                                flex: `0 0 ${100 / cardsToShow}%`,
                                                                minWidth: `${100 / cardsToShow}%`,
                                                                maxWidth: `${100 / cardsToShow}%`
                                                            }}
                                                        >
                                                            <MiniStepCard
                                                                step={item.data}
                                                                index={globalIdx}
                                                                isActive={globalIdx === activeIndex}
                                                                onClick={() => handleCardClick(globalIdx)}
                                                                stepId={item.type === 'step' ? item.data.id : undefined}
                                                                isPayload={item.type === 'payload'}
                                                                isTransform={item.type === 'transform'}
                                                                isFinal={item.type === 'final'}
                                                                isRunningAll={!!isExecuting}
                                                                isTesting={isExecutingStep === (item.type === 'step' ? (globalIdx - 1) : -1)}
                                                                completedSteps={completedSteps}
                                                                failedSteps={failedSteps}
                                                            />
                                                        </div>
                                                        {showArrow && (
                                                            <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}

                                            {/* Right indicator - positioned between last card and right arrow */}
                                            {hasHiddenRight && null}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleNavigation('next')}
                        disabled={activeIndex === workflowItems.length - 1}
                        className="shrink-0 h-9 w-9"
                        title="Next"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                {/* Simplified indicator dots: one per mini card */}
                <div className="flex justify-center items-center gap-2">
                    <div className="flex gap-1">
                        {indicatorIndices.map((globalIdx) => (
                            <button
                                key={`dot-${globalIdx}`}
                                onClick={() => setActiveIndex(globalIdx)}
                                className={cn(
                                    "w-1.5 h-1.5 rounded-full transition-colors",
                                    globalIdx === activeIndex ? "bg-primary" : "bg-muted"
                                )}
                                aria-label={`Go to item ${globalIdx + 1}`}
                                title={`Go to item ${globalIdx + 1}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Spotlight Card */}
                <div className="min-h-[220px] max-w-6xl mx-auto">
                    {currentItem && (
                        currentItem.type === 'payload' ? (
                            <PayloadCard
                                payload={currentItem.data.payload}
                                inputSchema={currentItem.data.inputSchema}
                                onChange={onPayloadChange}
                                onInputSchemaChange={onInputSchemaChange}
                                readOnly={readOnly}
                            />
                        ) : currentItem.type === 'transform' ? (
                            <FinalTransformCard
                                transform={currentItem.data.transform}
                                responseSchema={currentItem.data.responseSchema}
                                onTransformChange={onFinalTransformChange}
                                onResponseSchemaChange={onResponseSchemaChange}
                                readOnly={readOnly}
                                onExecuteTransform={onExecuteTransform}
                                isExecuting={isExecutingTransform}
                                canExecute={steps.every((s: any) => completedSteps.includes(s.id))}
                                transformResult={transformResult || finalResult}
                            />
                        ) : currentItem.type === 'final' ? (
                            <FinalResultsCard result={currentItem.data.result} />
                        ) : (
                            <SpotlightStepCard
                                step={currentItem.data}
                                stepIndex={activeIndex - 1} // Adjust for payload card
                                evolvingPayload={currentItem.evolvingPayload || {}}
                                stepResult={currentItem.stepResult}
                                onEdit={!readOnly ? onStepEdit : undefined}
                                onRemove={!readOnly && currentItem.type === 'step' ? handleRemoveStep : undefined}
                                onExecuteStep={onExecuteStep ? () => onExecuteStep(activeIndex - 1) : undefined}
                                canExecute={canExecuteStep(activeIndex - 1, completedSteps, { steps } as any, stepResultsMap)}
                                isExecuting={isExecutingStep === activeIndex - 1}
                                integrations={integrations}
                                readOnly={readOnly}
                                failedSteps={failedSteps}
                            />
                        )
                    )}
                </div>

                {/* Final results moved into a dedicated mini card and spotlight */}
            </div>
        </div>
    );
}
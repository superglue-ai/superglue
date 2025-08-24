import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import JsonSchemaEditor from '@/src/components/utils/JsonSchemaEditor';
import { canExecuteStep } from '@/src/lib/client-utils';
import { cn } from '@/src/lib/utils';
import { Integration } from "@superglue/client";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, Copy, Database, Eye, FileJson, Layers, Package, Pencil, Play, Plus, Settings, Trash2, X } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import { useEffect, useState } from 'react';
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
    completedSteps?: string[];
    integrations?: Integration[];
    isExecuting?: boolean;
    isExecutingStep?: number;
    readOnly?: boolean;
    payload?: any;
}

const highlightCode = (code: string, language: string) => {
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

// Helper to truncate data for display
const truncateData = (data: any, maxDepth = 3, currentDepth = 0): any => {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
        if (data.length === 0) return [];

        // For arrays, show first item fully and indicate truncation
        if (currentDepth < maxDepth) {
            const firstItem = truncateData(data[0], maxDepth, currentDepth + 1);
            if (data.length > 1) {
                return [firstItem, `... ${data.length - 1} more items`];
            }
            return [firstItem];
        }
        return `[Array of ${data.length} items]`;
    }

    if (typeof data === 'object') {
        if (currentDepth >= maxDepth) {
            return '{...}';
        }

        const truncated: Record<string, any> = {};
        const keys = Object.keys(data);
        const keysToShow = keys.slice(0, 10); // Show more keys

        keysToShow.forEach(key => {
            truncated[key] = truncateData(data[key], maxDepth, currentDepth + 1);
        });

        if (keys.length > 10) {
            truncated['...'] = `${keys.length - 10} more properties`;
        }

        return truncated;
    }

    // For strings, truncate if too long
    if (typeof data === 'string' && data.length > 100) {
        return data.substring(0, 100) + '...';
    }

    return data;
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
                [`step_${step.id}_result`]: result
            };
        }
    }

    return evolvingPayload;
};

// Copy button component
const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-6 w-6 absolute top-1 right-1"
        >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
    );
};

// Instruction Display Component with truncation and modal
const InstructionDisplay = ({
    instruction,
    onEdit
}: {
    instruction: string;
    onEdit?: () => void;
}) => {
    const [showFull, setShowFull] = useState(false);
    const MAX_LENGTH = 100;
    const truncated = instruction.length > MAX_LENGTH
        ? instruction.substring(0, MAX_LENGTH) + '...'
        : instruction;

    return (
        <>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md border">
                <div className="flex-1 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <p className="text-xs text-muted-foreground font-medium">INSTRUCTION:</p>
                    <p className="text-xs font-mono text-foreground/80 truncate flex-1">
                        {truncated}
                    </p>
                </div>
                <div className="flex items-center gap-1">
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
                        onClick={() => navigator.clipboard.writeText(instruction)}
                        title="Copy"
                    >
                        <Copy className="h-3 w-3" />
                    </Button>
                    {onEdit && (
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
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Workflow Instruction</h3>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowFull(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                                <p className="text-sm font-mono whitespace-pre-wrap">
                                    {instruction}
                                </p>
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        navigator.clipboard.writeText(instruction);
                                    }}
                                >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                </Button>
                                {onEdit && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setShowFull(false);
                                            onEdit();
                                        }}
                                    >
                                        <Pencil className="h-3 w-3 mr-1" />
                                        Edit
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </>
    );
};

// Split JSON Editor Component with copy buttons
const SplitJsonEditor = ({
    data,
    readOnly = true,
    minHeight = '100px',
    maxHeight = '200px'
}: {
    data: any;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
}) => {
    const schemaStr = data ? JSON.stringify(inferSchema(data), null, 2) : '{}';
    const dataStr = data ? JSON.stringify(truncateData(data), null, 2) : '{}';

    return (
        <div className="grid grid-cols-2 gap-2">
            {/* Schema */}
            <div>
                <div className="text-[10px] text-muted-foreground mb-1 font-medium">SCHEMA</div>
                <div className="relative bg-background dark:bg-muted/10 rounded-md border">
                    <CopyButton text={schemaStr} />
                    <div className="p-1.5 pr-8 overflow-auto" style={{ maxHeight }}>
                        <Editor
                            value={schemaStr}
                            onValueChange={() => { }}
                            highlight={(code) => highlightCode(code, 'json')}
                            padding={0}
                            disabled={readOnly}
                            className="font-mono text-[10px] leading-[14px]"
                            style={{
                                minHeight,
                                background: 'transparent',
                                lineHeight: '14px'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Data Preview */}
            <div>
                <div className="text-[10px] text-muted-foreground mb-1 font-medium">DATA PREVIEW</div>
                <div className="relative bg-background dark:bg-muted/10 rounded-md border">
                    <CopyButton text={dataStr} />
                    <div className="p-1.5 pr-8 overflow-auto" style={{ maxHeight }}>
                        <Editor
                            value={dataStr}
                            onValueChange={() => { }}
                            highlight={(code) => highlightCode(code, 'json')}
                            padding={0}
                            disabled={readOnly}
                            className="font-mono text-[10px] leading-[14px]"
                            style={{
                                minHeight,
                                background: 'transparent',
                                lineHeight: '14px'
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
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
        <div className="relative bg-muted/50 dark:bg-muted/20 rounded-lg border font-mono shadow-sm">
            {showCopy && <CopyButton text={value || ''} />}
            <div className="absolute left-0 top-0 bottom-0 w-10 bg-muted/30 border-r rounded-l-lg">
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
                    value={value || '// No transformation defined'}
                    onValueChange={onChange || (() => { })}
                    highlight={(code) => {
                        try {
                            // Use JavaScript highlighting specifically
                            return Prism.highlight(code, Prism.languages.javascript, 'javascript');
                        } catch {
                            return code;
                        }
                    }}
                    padding={0}
                    disabled={readOnly}
                    className="font-mono text-[11px] leading-[18px]"
                    textareaClassName="outline-none"
                    style={{
                        minHeight,
                        background: 'transparent',
                        lineHeight: '18px'
                    }}
                />
            </div>
        </div>
    );
};

// JSON Code Editor without blue border
const JsonCodeEditor = ({
    value,
    onChange,
    readOnly = false,
    minHeight = '150px',
    maxHeight = '400px',
    placeholder = '{}'
}: {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    placeholder?: string;
}) => {
    return (
        <div className="relative bg-muted/30 rounded-lg border shadow-sm">
            <CopyButton text={value || placeholder} />
            <div className="p-3 pr-10 overflow-auto" style={{ maxHeight }}>
                <Editor
                    value={value || placeholder}
                    onValueChange={onChange || (() => { })}
                    highlight={(code) => highlightCode(code, 'json')}
                    padding={0}
                    disabled={readOnly}
                    className="font-mono text-xs"
                    textareaClassName="outline-none"
                    style={{
                        minHeight,
                        background: 'transparent',
                    }}
                />
            </div>
        </div>
    );
};

// Initial Payload Card - editable without blue border
const PayloadCard = ({
    payload,
    onChange,
    readOnly
}: {
    payload: any;
    onChange?: (value: string) => void;
    readOnly?: boolean;
}) => {
    const [localPayload, setLocalPayload] = useState(() =>
        payload ? JSON.stringify(payload, null, 2) : '{}'
    );
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLocalPayload(payload ? JSON.stringify(payload, null, 2) : '{}');
    }, [payload]);

    const handleChange = (value: string) => {
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

    return (
        <Card className="w-full max-w-5xl mx-auto shadow-md border-2 dark:border-border/50">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-1.5 bg-muted rounded-lg">
                        <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Initial Payload</h3>
                        <span className="text-xs text-muted-foreground">JSON Data Input</span>
                    </div>
                </div>

                <JsonCodeEditor
                    value={localPayload}
                    onChange={handleChange}
                    readOnly={readOnly}
                    minHeight="150px"
                    maxHeight="350px"
                />

                {error && (
                    <div className="mt-3 text-sm text-destructive flex items-center gap-2">
                        <span className="text-destructive">⚠</span> {error}
                    </div>
                )}
            </div>
        </Card>
    );
};

// Final Transform Card with integrated response schema editor
const FinalTransformCard = ({
    transform,
    responseSchema,
    onTransformChange,
    onResponseSchemaChange,
    readOnly
}: {
    transform?: string;
    responseSchema?: string;
    onTransformChange?: (value: string) => void;
    onResponseSchemaChange?: (value: string) => void;
    readOnly?: boolean;
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
        <Card className="w-full max-w-5xl mx-auto shadow-md border-2 dark:border-border/50">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-1.5 bg-muted rounded-lg">
                        <Code2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Final Transformation</h3>
                        <span className="text-xs text-muted-foreground">JavaScript Transform & Response Schema</span>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                        <TabsTrigger value="transform">Transform Code</TabsTrigger>
                        <TabsTrigger value="schema">Response Schema</TabsTrigger>
                    </TabsList>

                    <TabsContent value="transform" className="mt-4">
                        <JavaScriptCodeEditor
                            value={localTransform}
                            onChange={handleTransformChange}
                            readOnly={readOnly}
                            minHeight="250px"
                            maxHeight="400px"
                        />
                    </TabsContent>

                    <TabsContent value="schema" className="mt-4">
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
    readOnly
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
}) => {
    const [showInput, setShowInput] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [showOutput, setShowOutput] = useState(false);

    return (
        <Card className="w-full max-w-5xl mx-auto shadow-md bg-accent/10 dark:bg-accent/5 border-2 border-accent/30 dark:border-accent/20">
            <div className="p-6">
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
                                title={!canExecute ? "Execute previous steps first" : "Test this step"}
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

                <div className="space-y-4">
                    {/* Step Input */}
                    <div>
                        <button
                            onClick={() => setShowInput(!showInput)}
                            className="flex items-center gap-2 text-sm font-medium mb-2"
                        >
                            <ChevronDown className={cn(
                                "h-4 w-4 transition-transform",
                                !showInput && "-rotate-90"
                            )} />
                            <FileJson className="h-4 w-4" />
                            Step Input
                        </button>
                        {showInput && (
                            <SplitJsonEditor
                                data={evolvingPayload}
                                readOnly={true}
                                minHeight="80px"
                                maxHeight="150px"
                            />
                        )}
                    </div>

                    {/* Step Configuration */}
                    <div>
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className="flex items-center gap-2 text-sm font-medium mb-2"
                        >
                            <ChevronDown className={cn(
                                "h-4 w-4 transition-transform",
                                !showConfig && "-rotate-90"
                            )} />
                            <Settings className="h-4 w-4" />
                            Step Configuration
                        </button>
                        {showConfig && (
                            <div className="mt-2">
                                <WorkflowStepCard
                                    step={step}
                                    isLast={true}
                                    onEdit={onEdit}
                                    onRemove={() => { }}
                                    integrations={integrations}
                                />
                            </div>
                        )}
                    </div>

                    {/* Step Output */}
                    <div>
                        <button
                            onClick={() => setShowOutput(!showOutput)}
                            className="flex items-center gap-2 text-sm font-medium mb-2"
                        >
                            <ChevronDown className={cn(
                                "h-4 w-4 transition-transform",
                                !showOutput && "-rotate-90"
                            )} />
                            <Package className="h-4 w-4" />
                            Step Output
                        </button>
                        {showOutput && (
                            <SplitJsonEditor
                                data={stepResult}
                                readOnly={true}
                                minHeight="80px"
                                maxHeight="150px"
                            />
                        )}
                    </div>

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
    hasResult,
    isPayload = false,
    isTransform = false,
    isExecuting = false
}: {
    step: any;
    index: number;
    isActive: boolean;
    onClick: () => void;
    hasResult: boolean;
    isPayload?: boolean;
    isTransform?: boolean;
    isExecuting?: boolean;
}) => {
    if (isPayload) {
        return (
            <div
                className={cn(
                    "cursor-pointer transition-all duration-200",
                    isActive ? "scale-105" : "scale-100 opacity-80 hover:opacity-100"
                )}
                onClick={onClick}
            >
                <Card className={cn(
                    "p-5 min-w-[240px] max-w-[280px]",
                    isActive && "ring-2 ring-primary shadow-lg"
                )}>
                    <div className="flex flex-col items-center gap-2">
                        <Package className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium">Initial Payload</p>
                        <p className="text-xs text-muted-foreground">JSON</p>
                    </div>
                </Card>
            </div>
        );
    }

    if (isTransform) {
        return (
            <div
                className={cn(
                    "cursor-pointer transition-all duration-200",
                    isActive ? "scale-105" : "scale-100 opacity-80 hover:opacity-100"
                )}
                onClick={onClick}
            >
                <Card className={cn(
                    "p-5 min-w-[240px] max-w-[280px]",
                    isActive && "ring-2 ring-primary shadow-lg"
                )}>
                    <div className="flex flex-col items-center gap-2">
                        <Code2 className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium">Final Transform</p>
                        <p className="text-xs text-muted-foreground">JavaScript</p>
                    </div>
                </Card>
            </div>
        );
    }

    const method = step.apiConfig?.method || 'GET';
    const url = `${step.apiConfig?.urlHost || ''}${step.apiConfig?.urlPath || ''}`.trim() || 'No URL';

    // Determine status dot color
    const getStatusDotColor = () => {
        if (isExecuting) return "bg-yellow-500 animate-pulse";
        if (hasResult) return "bg-green-500";
        return "bg-gray-400";
    };

    return (
        <div
            className={cn(
                "cursor-pointer transition-all duration-200",
                isActive ? "scale-105" : "scale-100 opacity-80 hover:opacity-100"
            )}
            onClick={onClick}
        >
            <Card className={cn(
                "p-5 min-w-[240px] max-w-[280px]",
                isActive && "ring-2 ring-primary shadow-lg"
            )}>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
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
                    <div>
                        <p className="text-sm font-semibold truncate">
                            {step.id || `Step ${index}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                            {url}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "w-2 h-2 rounded-full transition-all",
                            getStatusDotColor()
                        )} />
                        <span className="text-xs text-muted-foreground">
                            {isExecuting ? "Testing..." : hasResult ? "Completed" : "Pending"}
                        </span>
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
    completedSteps = [],
    integrations,
    isExecuting,
    isExecutingStep,
    readOnly = false,
    payload
}: WorkflowStepGalleryProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const ITEMS_PER_PAGE = 4;

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
            data: { payload },
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
        }] : [])
    ];

    // Calculate pagination
    const totalPages = Math.ceil(workflowItems.length / ITEMS_PER_PAGE);
    const startIndex = currentPage * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, workflowItems.length);
    const visibleItems = workflowItems.slice(startIndex, endIndex);

    const currentItem = workflowItems[activeIndex];

    const handleNavigation = (direction: 'prev' | 'next') => {
        const newIndex = direction === 'prev'
            ? Math.max(0, activeIndex - 1)
            : Math.min(workflowItems.length - 1, activeIndex + 1);
        setActiveIndex(newIndex);

        // Update page if needed
        const newPage = Math.floor(newIndex / ITEMS_PER_PAGE);
        if (newPage !== currentPage) {
            setCurrentPage(newPage);
        }
    };

    const handleCardClick = (globalIndex: number) => {
        setActiveIndex(globalIndex);
    };

    const handleAddStep = () => {
        if (!onStepsChange) return;

        const newStep = {
            id: `step-${Date.now()}`,
            name: "New Step",
            type: "default",
            apiConfig: {
                id: `step-${Date.now()}`,
                method: 'GET',
                urlHost: '',
                urlPath: '',
                headers: {},
                queryParams: {},
                body: ''
            },
            inputMapping: "$",
            responseMapping: "$",
            executionMode: 'DIRECT',
        };
        onStepsChange([...steps, newStep]);
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

    // Auto-select first item on mount
    useEffect(() => {
        setActiveIndex(0);
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Layers className="h-5 w-5 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">Workflow</h2>
                        {workflowId && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md border">
                                <span className="text-xs text-muted-foreground">ID:</span>
                                <Input
                                    value={workflowId}
                                    onChange={(e) => onWorkflowIdChange?.(e.target.value)}
                                    className="h-6 font-mono text-sm w-[320px] border-0 bg-transparent p-0 focus:ring-0"
                                    readOnly={readOnly || !onWorkflowIdChange}
                                />
                            </div>
                        )}
                    </div>

                    {!readOnly && onStepsChange && (
                        <Button onClick={handleAddStep} variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Step
                        </Button>
                    )}
                </div>

                {/* Instruction Display */}
                {instruction && (
                    <InstructionDisplay
                        instruction={instruction}
                        onEdit={onInstructionEdit}
                    />
                )}
            </div>

            {/* Navigation Controls with paginated cards */}
            <div className="flex items-center gap-4">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleNavigation('prev')}
                    disabled={activeIndex === 0}
                    className="shrink-0"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                {/* Paginated mini cards */}
                <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-3">
                        {currentPage > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(currentPage - 1)}
                                className="text-xs"
                            >
                                ...
                            </Button>
                        )}

                        {visibleItems.map((item, localIndex) => {
                            const globalIndex = startIndex + localIndex;
                            return (
                                <div key={globalIndex} className="flex items-center">
                                    <MiniStepCard
                                        step={item.data}
                                        index={globalIndex}
                                        isActive={globalIndex === activeIndex}
                                        onClick={() => handleCardClick(globalIndex)}
                                        hasResult={item.type === 'step' ? completedSteps.includes(item.data.id) : !!item.stepResult}
                                        isPayload={item.type === 'payload'}
                                        isTransform={item.type === 'transform'}
                                        isExecuting={item.type === 'step' && isExecutingStep === globalIndex - 1}
                                    />
                                    {localIndex < visibleItems.length - 1 && (
                                        <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                                    )}
                                </div>
                            );
                        })}

                        {currentPage < totalPages - 1 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(currentPage + 1)}
                                className="text-xs"
                            >
                                ...
                            </Button>
                        )}
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleNavigation('next')}
                    disabled={activeIndex === workflowItems.length - 1}
                    className="shrink-0"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            {/* Page indicators */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentPage(i)}
                            className={cn(
                                "w-2 h-2 rounded-full transition-all",
                                i === currentPage ? "bg-primary w-6" : "bg-muted hover:bg-muted-foreground/30"
                            )}
                        />
                    ))}
                </div>
            )}

            {/* Spotlight Card */}
            <div className="min-h-[400px]">
                {currentItem && (
                    currentItem.type === 'payload' ? (
                        <PayloadCard
                            payload={currentItem.data.payload}
                            onChange={onPayloadChange}
                            readOnly={readOnly}
                        />
                    ) : currentItem.type === 'transform' ? (
                        <FinalTransformCard
                            transform={currentItem.data.transform}
                            responseSchema={currentItem.data.responseSchema}
                            onTransformChange={onFinalTransformChange}
                            onResponseSchemaChange={onResponseSchemaChange}
                            readOnly={readOnly}
                        />
                    ) : (
                        <SpotlightStepCard
                            step={currentItem.data}
                            stepIndex={activeIndex - 1} // Adjust for payload card
                            evolvingPayload={currentItem.evolvingPayload || {}}
                            stepResult={currentItem.stepResult}
                            onEdit={!readOnly ? onStepEdit : undefined}
                            onRemove={!readOnly && currentItem.type === 'step' ? handleRemoveStep : undefined}
                            onExecuteStep={onExecuteStep ? () => onExecuteStep(activeIndex - 1) : undefined}
                            canExecute={canExecuteStep(activeIndex - 1, completedSteps, { steps } as any)}
                            isExecuting={isExecutingStep === activeIndex - 1}
                            integrations={integrations}
                            readOnly={readOnly}
                        />
                    )
                )}
            </div>
        </div>
    );
}
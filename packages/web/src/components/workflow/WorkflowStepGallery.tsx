import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import JsonSchemaEditor from '@/src/components/utils/JsonSchemaEditor';
import { cn } from '@/src/lib/utils';
import { Integration } from "@superglue/client";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, Copy, Database, FileJson, Layers, Package, Pencil, Play, Plus, Settings, Trash2 } from 'lucide-react';
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
            return Prism.highlight(code, Prism.languages.javascript, 'javascript');
        }
        return Prism.highlight(code, Prism.languages.json || Prism.languages.javascript, 'json');
    } catch {
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

// Split JSON Editor Component with copy buttons
const SplitJsonEditor = ({
    data,
    readOnly = true,
    minHeight = '150px',
    maxHeight = '300px'
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
                <div className="text-xs text-muted-foreground mb-1">Schema</div>
                <div className="relative bg-background dark:bg-muted/10 rounded-md border">
                    <CopyButton text={schemaStr} />
                    <div className="p-2 pr-8 overflow-auto" style={{ maxHeight }}>
                        <Editor
                            value={schemaStr}
                            onValueChange={() => { }}
                            highlight={(code) => highlightCode(code, 'json')}
                            padding={0}
                            disabled={readOnly}
                            className="font-mono text-xs"
                            style={{
                                minHeight,
                                background: 'transparent',
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Data Preview */}
            <div>
                <div className="text-xs text-muted-foreground mb-1">Data Preview</div>
                <div className="relative bg-background dark:bg-muted/10 rounded-md border">
                    <CopyButton text={dataStr} />
                    <div className="p-2 pr-8 overflow-auto" style={{ maxHeight }}>
                        <Editor
                            value={dataStr}
                            onValueChange={() => { }}
                            highlight={(code) => highlightCode(code, 'json')}
                            padding={0}
                            disabled={readOnly}
                            className="font-mono text-xs"
                            style={{
                                minHeight,
                                background: 'transparent',
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
    minHeight = '250px',
    maxHeight = '400px',
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
        <div className="relative bg-gradient-to-br from-slate-900/95 to-slate-800/95 dark:from-slate-950 dark:to-slate-900 rounded-lg border border-slate-700/50 font-mono shadow-xl">
            {showCopy && <CopyButton text={value || ''} />}
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-black/20 border-r border-slate-700/30 rounded-l-lg">
                <div className="flex flex-col py-3" style={{ maxHeight, overflow: 'auto' }}>
                    {lines.map((_, i) => (
                        <div key={i} className="text-xs text-slate-500 text-right pr-3 leading-5 select-none">
                            {i + 1}
                        </div>
                    ))}
                </div>
            </div>
            <div className="pl-14 pr-3 py-3 overflow-auto" style={{ maxHeight }}>
                <Editor
                    value={value || '// No transformation defined'}
                    onValueChange={onChange || (() => { })}
                    highlight={(code) => highlightCode(code, 'javascript')}
                    padding={0}
                    disabled={readOnly}
                    className="font-mono text-xs text-slate-100"
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
        <div className="relative bg-gradient-to-br from-emerald-950/20 to-teal-950/20 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-lg border border-emerald-900/30 shadow-lg">
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
        <Card className="w-full max-w-6xl mx-auto shadow-xl bg-gradient-to-br from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-200 dark:border-emerald-900/50">
            <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                        <Package className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold">Initial Payload</h3>
                        <span className="text-sm text-muted-foreground">JSON Data Input</span>
                    </div>
                </div>

                <JsonCodeEditor
                    value={localPayload}
                    onChange={handleChange}
                    readOnly={readOnly}
                    minHeight="200px"
                    maxHeight="500px"
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
        <Card className="w-full max-w-6xl mx-auto shadow-xl bg-gradient-to-br from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-900/50">
            <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                        <Code2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold">Final Transformation</h3>
                        <span className="text-sm text-muted-foreground">JavaScript Transform & Response Schema</span>
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
                            minHeight="350px"
                            maxHeight="600px"
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
        <Card className="w-full max-w-6xl mx-auto shadow-lg">
            <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-xl font-semibold">
                            {step.id || `Step ${stepIndex + 1}`}
                        </h3>
                        {step.name && step.name !== step.id && (
                            <span className="text-sm text-muted-foreground">({step.name})</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!readOnly && onExecuteStep && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={onExecuteStep}
                                disabled={!canExecute || isExecuting}
                                title={!canExecute ? "Execute previous steps first" : "Test this step"}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
                                minHeight="120px"
                                maxHeight="200px"
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
                                minHeight="120px"
                                maxHeight="200px"
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
    isTransform = false
}: {
    step: any;
    index: number;
    isActive: boolean;
    onClick: () => void;
    hasResult: boolean;
    isPayload?: boolean;
    isTransform?: boolean;
}) => {
    if (isPayload) {
        return (
            <div
                className={cn(
                    "cursor-pointer transition-all duration-200",
                    isActive ? "scale-105" : "scale-100 opacity-70 hover:opacity-90"
                )}
                onClick={onClick}
            >
                <Card className={cn(
                    "p-4 min-w-[200px] max-w-[250px]",
                    isActive && "ring-2 ring-primary shadow-lg"
                )}>
                    <div className="flex flex-col items-center gap-2">
                        <Package className="h-5 w-5 text-muted-foreground" />
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
                    isActive ? "scale-105" : "scale-100 opacity-70 hover:opacity-90"
                )}
                onClick={onClick}
            >
                <Card className={cn(
                    "p-4 min-w-[200px] max-w-[250px]",
                    isActive && "ring-2 ring-primary shadow-lg"
                )}>
                    <div className="flex flex-col items-center gap-2">
                        <Code2 className="h-5 w-5 text-muted-foreground" />
                        <p className="text-sm font-medium">Final Transform</p>
                        <p className="text-xs text-muted-foreground">JavaScript</p>
                    </div>
                </Card>
            </div>
        );
    }

    const method = step.apiConfig?.method || 'GET';
    const url = `${step.apiConfig?.urlHost || ''}${step.apiConfig?.urlPath || ''}`.trim() || 'No URL';

    return (
        <div
            className={cn(
                "cursor-pointer transition-all duration-200",
                isActive ? "scale-105" : "scale-100 opacity-70 hover:opacity-90"
            )}
            onClick={onClick}
        >
            <Card className={cn(
                "p-4 min-w-[200px] max-w-[250px]",
                isActive && "ring-2 ring-primary shadow-lg"
            )}>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold",
                            hasResult ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted"
                        )}>
                            {index}
                        </div>
                        <span className={cn(
                            "text-xs px-2 py-0.5 rounded font-medium",
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
                        <p className="text-sm font-medium truncate">
                            {step.id || `Step ${index}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                            {url}
                        </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {hasResult ? "✓ Completed" : "○ Pending"}
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
    onStepEdit,
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
                            <Input
                                value={workflowId}
                                onChange={(e) => onWorkflowIdChange?.(e.target.value)}
                                className="h-8 font-mono text-sm w-[260px]"
                                readOnly={readOnly || !onWorkflowIdChange}
                            />
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
                    <div className="relative bg-muted/50 rounded-lg p-3 border border-border">
                        <div className="font-mono text-sm text-muted-foreground max-h-20 overflow-y-auto pr-16">
                            "{instruction}"
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => navigator.clipboard.writeText(instruction)}
                                title="Copy"
                            >
                                <Copy className="h-3 w-3" />
                            </Button>
                            {onInstructionEdit && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={onInstructionEdit}
                                    title="Edit"
                                >
                                    <Pencil className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    </div>
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
                                        hasResult={!!item.stepResult}
                                        isPayload={item.type === 'payload'}
                                        isTransform={item.type === 'transform'}
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
            <div className="min-h-[500px]">
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
                            canExecute={activeIndex === 1 || completedSteps.includes(steps[activeIndex - 2]?.id)}
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
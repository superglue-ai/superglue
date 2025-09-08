import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { canExecuteStep } from '@/src/lib/client-utils';
import { cn, isEmptyData } from '@/src/lib/utils';
import { Integration } from "@superglue/client";
import { inferJsonSchema } from '@superglue/shared';
import { ChevronLeft, ChevronRight, Database, FileJson, Package, Play, Settings, Trash2 } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import React, { useEffect, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { CopyButton, FinalResultsCard, FinalTransformMiniStepCard, InstructionDisplay, JsonCodeEditor, MiniStepCard, PayloadMiniStepCard, truncateForDisplay, truncateLines } from './WorkflowMiniStepCards';
import { WorkflowStepConfigurator } from './WorkflowStepConfigurator';

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
    onExecuteTransform?: (schema: string, transform: string) => Promise<void>;
    completedSteps?: string[];
    failedSteps?: string[];
    integrations?: Integration[];
    isExecuting?: boolean;
    isExecutingStep?: number;
    isExecutingTransform?: boolean;
    currentExecutingStepIndex?: number;
    transformResult?: any;
    readOnly?: boolean;
    payload?: any;
    inputSchema?: string | null;
    onInputSchemaChange?: (schema: string | null) => void;
    headerActions?: React.ReactNode;
    navigateToFinalSignal?: number;
    showStepOutputSignal?: number;
    focusStepId?: string | null;
}

// Highlighting moved to WorkflowMiniStepCards

const inferSchema = inferJsonSchema;

// Size-based truncation for display 
const MAX_DISPLAY_SIZE = 1024 * 1024; // 1MB limit for JSON display
const MAX_DISPLAY_LINES = 3000; // Max lines to show in any JSON view
const MAX_STRING_PREVIEW_LENGTH = 3000; // Max chars for individual string values
const MAX_ARRAY_PREVIEW_ITEMS = 10; // Max array items to show before truncating
const MAX_TRUNCATION_DEPTH = 10; // Max depth for nested object traversal
const MAX_OBJECT_PREVIEW_KEYS = 100; // Max object keys to show before truncating

const truncateValue = (value: any, depth: number = 0): any => {
    if (depth > MAX_TRUNCATION_DEPTH) {
        if (Array.isArray(value)) return '[...]';
        if (typeof value === 'object' && value !== null) return '{...}';
        return '...';
    }

    if (typeof value === 'string') {
        if (value.length > MAX_STRING_PREVIEW_LENGTH) {
            return value.substring(0, MAX_STRING_PREVIEW_LENGTH) + `... [${value.length.toLocaleString()} chars total]`;
        }
        return value;
    }

    if (Array.isArray(value)) {
        if (value.length > MAX_ARRAY_PREVIEW_ITEMS) {
            return [...value.slice(0, MAX_ARRAY_PREVIEW_ITEMS).map(v => truncateValue(v, depth + 1)), `... ${value.length - MAX_ARRAY_PREVIEW_ITEMS} more items`];
        }
        return value.map(v => truncateValue(v, depth + 1));
    }

    if (typeof value === 'object' && value !== null) {
        const result: any = {};
        const keys = Object.keys(value);
        const keysToShow = keys.slice(0, MAX_OBJECT_PREVIEW_KEYS);
        for (const key of keysToShow) {
            result[key] = truncateValue(value[key], depth + 1);
        }
        if (keys.length > MAX_OBJECT_PREVIEW_KEYS) {
            result['...'] = `${(keys.length - MAX_OBJECT_PREVIEW_KEYS).toLocaleString()} more keys`;
        }

        return result;
    }

    return value;
};

// moved to WorkflowMiniStepCards
// truncateForDisplay moved to WorkflowMiniStepCards



// moved to WorkflowMiniStepCards
// truncateLines moved to WorkflowMiniStepCards

const buildEvolvingPayload = (initialPayload: any, steps: any[], stepResults: Record<string, any>, upToIndex: number) => {
    let evolvingPayload = { ...initialPayload };

    for (let i = 0; i <= upToIndex && i < steps.length; i++) {
        const step = steps[i];
        const result = stepResults[step.id];
        if (result !== undefined && result !== null) {
            const dataToMerge = (typeof result === 'object' && 'data' in result && 'success' in result)
                ? result.data
                : result;

            evolvingPayload = {
                ...evolvingPayload,
                [`${step.id}`]: dataToMerge
            };
        }
    }

    return evolvingPayload;
};

// CopyButton moved to WorkflowMiniStepCards

/* Moved to WorkflowMiniStepCards */
// InstructionDisplay moved to WorkflowMiniStepCards

/* Moved to WorkflowMiniStepCards */
// FinalResultsCard moved to WorkflowMiniStepCards

const JavaScriptCodeEditor = React.memo(({
    value,
    onChange,
    readOnly = false,
    minHeight = '200px',
    maxHeight = '350px',
    showCopy = true,
    resizable = false,
    isTransformEditor = false
}: {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    minHeight?: string;
    maxHeight?: string;
    showCopy?: boolean;
    resizable?: boolean;
    isTransformEditor?: boolean;
}) => {
    const [currentHeight, setCurrentHeight] = useState(maxHeight);
    const effectiveHeight = resizable ? currentHeight : maxHeight;
    const highlightTimer = useRef<number | null>(null);
    const [allowHighlight, setAllowHighlight] = useState<boolean>(true);

    // Check if code already has the proper arrow function format
    const hasValidPattern = (code: string): boolean => {
        const arrowFunctionPattern = /^\s*\(\s*sourceData\s*\)\s*=>\s*\{[\s\S]*\}\s*$/;
        return arrowFunctionPattern.test(code);
    };

    // Ensure the code has the proper format for execution
    const ensureValidTransform = (code: string): string => {
        if (!code || !code.trim()) {
            return `(sourceData) => {\n  // Transform sourceData into final output\n  return sourceData;\n}`;
        }

        // If it already has the correct pattern, return as-is
        if (hasValidPattern(code)) {
            return code;
        }

        // Otherwise, wrap it
        return `(sourceData) => {\n${code}\n}`;
    };

    // Handle value for transform editor
    const displayValue = value || '';

    // Throttle prism highlighting while typing to keep typing snappy
    useEffect(() => {
        setAllowHighlight(false);
        if (highlightTimer.current) {
            window.clearTimeout(highlightTimer.current);
        }
        highlightTimer.current = window.setTimeout(() => {
            setAllowHighlight(true);
        }, 120);
        return () => {
            if (highlightTimer.current) {
                window.clearTimeout(highlightTimer.current);
                highlightTimer.current = null;
            }
        };
    }, [displayValue]);

    const handleChange = (newValue: string) => {
        if (!onChange) return;

        if (isTransformEditor) {
            // Store exactly what the user types
            // We'll ensure valid format only when executing
            onChange(newValue);
        } else {
            onChange(newValue);
        }
    };

    // Calculate line numbers (memoized)
    const lineNumbers = React.useMemo(() => (displayValue || '').split('\n').map((_, i) => String(i + 1)), [displayValue]);

    return (
        <div className="relative bg-muted/50 dark:bg-muted/20 rounded-lg border font-mono shadow-sm js-code-editor">
            {(showCopy || isTransformEditor) && (
                <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
                    {isTransformEditor && (
                        <HelpTooltip
                            text="The transform must be an arrow function (sourceData) => { ... } that receives step results and returns the final output. Access each step's data via sourceData.stepId."
                        />
                    )}
                    {showCopy && <CopyButton text={value || ''} />}
                </div>
            )}
            {resizable && (
                <div
                    className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-10"
                    style={{
                        background: 'linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.3) 50%)',
                    }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startHeight = parseInt(currentHeight);

                        const handleMouseMove = (e: MouseEvent) => {
                            const deltaY = e.clientY - startY;
                            const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
                            setCurrentHeight(`${newHeight}px`);
                        };

                        const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                        };

                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                    }}
                />
            )}
            <div className="flex overflow-auto" style={{ maxHeight: effectiveHeight }}>
                {/* Line numbers column - scrolls with content */}
                <div className="flex-shrink-0 bg-muted/30 border-r px-2 py-2">
                    {lineNumbers.map((lineNum) => (
                        <div key={lineNum} className="text-[10px] text-muted-foreground text-right leading-[18px] select-none">
                            {lineNum}
                        </div>
                    ))}
                </div>

                {/* Code content */}
                <div className="flex-1 px-3 py-2">
                    {isTransformEditor ? (
                        <>
                            {/* Pattern indicator - shows if the format is valid */}
                            {displayValue && !hasValidPattern(displayValue) && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                                    <span>⚠</span>
                                    <span>Code will be auto-wrapped with (sourceData) =&gt; {'{'} ... {'}'} when executed</span>
                                </div>
                            )}
                            <Editor
                                value={displayValue}
                                onValueChange={handleChange}
                                highlight={(code) => {
                                    if (!allowHighlight) return code;
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
                                textareaId="transform-editor"
                                placeholder="(sourceData) => { return sourceData; }"
                                style={{
                                    background: 'transparent',
                                    lineHeight: '18px',
                                    minHeight: '100px'
                                }}
                            />
                        </>
                    ) : (
                        <Editor
                            value={value || ''}
                            onValueChange={onChange || (() => { })}
                            highlight={(code) => {
                                if (!allowHighlight) return code;
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

// JsonCodeEditor moved to WorkflowMiniStepCards

// Remove local stub; use imported PayloadMiniStepCard
/* const PayloadMiniStepCard = ({
    payload,
    inputSchema,
    onChange,
    onInputSchemaChange,
    readOnly
}: {
    payload: any;
    inputSchema?: string | null;
    onChange?: (value: string) => void;
    onInputSchemaChange?: (value: string | null) => void;
    readOnly?: boolean;
}) => {
    const [activeTab, setActiveTab] = useState('payload');
    const [localPayload, setLocalPayload] = useState(() =>
        payload ? JSON.stringify(payload, null, 2) : '{}'
    );
    const [localInputSchema, setLocalInputSchema] = useState(inputSchema || null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLocalPayload(payload ? JSON.stringify(payload, null, 2) : '{}');
    }, [payload]);

    useEffect(() => {
        setLocalInputSchema(inputSchema || null);
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
        setLocalInputSchema(value);
        if (onInputSchemaChange) {
            onInputSchemaChange(value);
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
                        <div className="mt-2 text-[10px] text-muted-foreground">
                            <HelpTooltip text="Payload is the concrete JSON sent when executing the workflow. It can include secrets merged from your credentials. Editing here does NOT save values to the workflow; it only affects this session/run. Use Input Schema to optionally describe the expected structure for validation and tooling." />
                        </div>
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
                        <div className="mt-2 text-[10px] text-muted-foreground">
                            <HelpTooltip text="Input Schema is optional and defines the expected payload shape for validation and AI guidance. Keep secrets out of the schema. Actual runtime values come from the Payload JSON merged with your credentials at execution time." />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </Card>
    );
}; */

// Remove local stub; use imported FinalTransformMiniStepCard
/* const FinalTransformMiniStepCard = ({
    transform,
    responseSchema,
    onTransformChange,
    onResponseSchemaChange,
    readOnly,
    onExecuteTransform,
    isExecutingTransform,
    canExecute,
    transformResult,
    stepInputs
}: {
    transform?: string;
    responseSchema?: string;
    onTransformChange?: (value: string) => void;
    onResponseSchemaChange?: (value: string) => void;
    readOnly?: boolean;
    onExecuteTransform?: (schema: string, transform: string) => void;
    isExecutingTransform?: boolean;
    canExecute?: boolean;
    transformResult?: any;
    stepInputs?: any;
}) => {
    const [activeTab, setActiveTab] = useState('transform');
    const [localTransform, setLocalTransform] = useState(transform || '');
    const [localSchema, setLocalSchema] = useState(responseSchema || '');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    // Track if we've initialized to prevent external updates
    const [schemaInitialized, setSchemaInitialized] = useState(false);

    useEffect(() => {
        setLocalTransform(transform || '');
    }, [transform]);

    useEffect(() => {
        // Only update localSchema from prop on initial mount, not on prop changes
        // This prevents the schema from being reset when navigating between tabs
        if (!schemaInitialized) {
            setLocalSchema(responseSchema || '');
            setSchemaInitialized(true);
        }
    }, [responseSchema, schemaInitialized]);

    // Update parent state when switching tabs (acts like blur)
    useEffect(() => {
        const handleTabChange = () => {
            if (onTransformChange && localTransform !== transform) {
                onTransformChange(localTransform);
            }
            if (onResponseSchemaChange && localSchema !== responseSchema) {
                onResponseSchemaChange(localSchema);
            }
        };

        handleTabChange();
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTransformChange = (value: string) => {
        setLocalTransform(value);
        // Optionally sync with parent on every change for real-time updates
        // This is commented out to avoid too frequent updates
        // if (onTransformChange) {
        //     onTransformChange(value);
        // }
    };

    const handleSchemaChange = (value: string | null) => {
        if (value === null) {
            setLocalSchema('');
            // Immediately sync with parent when schema is disabled
            if (onResponseSchemaChange) {
                onResponseSchemaChange('');
            }
        } else {
            setLocalSchema(value);
            // Immediately sync with parent when schema changes
            if (onResponseSchemaChange) {
                onResponseSchemaChange(value);
            }
        }
    };

    const handleExecuteTransform = () => {
        // Ensure the transform has valid format before executing
        const validTransform = ensureValidTransform(localTransform);

        if (onTransformChange) {
            // Save the original user input
            onTransformChange(localTransform);
        }
        if (onResponseSchemaChange) {
            onResponseSchemaChange(localSchema);
        }
        if (onExecuteTransform) {
            // Execute with the valid format
            onExecuteTransform(localSchema, validTransform);
        }
    };

    // Helper function to ensure valid transform format
    const ensureValidTransform = (code: string): string => {
        if (!code || !code.trim()) {
            return `(sourceData) => {\n  return sourceData;\n}`;
        }

        const arrowFunctionPattern = /^\s*\(\s*sourceData\s*\)\s*=>\s*\{[\s\S]*\}\s*$/;
        if (arrowFunctionPattern.test(code)) {
            return code;
        }

        // Wrap the code if it doesn't have the pattern
        return `(sourceData) => {\n${code}\n}`;
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
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                onClick={handleExecuteTransform}
                                disabled={!canExecute || isExecutingTransform}
                                title={!canExecute ? "Execute all steps first" : isExecutingTransform ? "Transform is executing..." : "Test final transform"}
                            >
                                {isExecutingTransform ? (
                                    <>
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                                        Running...
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-3 w-3 mr-1" />
                                        Run Transform
                                    </>
                                )}
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
                                const schemaObj = inferSchema(stepInputs || {});
                                inputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                            } else {
                                const displayData = truncateForDisplay(stepInputs);
                                inputString = displayData.value;
                                isTruncated = displayData.truncated;
                            }
                            return (
                                <>
                                    <JsonCodeEditor
                                        value={inputString}
                                        readOnly={true}
                                        minHeight="150px"
                                        maxHeight="250px"
                                        resizable={true}
                                        overlay={
                                            <div className="flex items-center gap-1">
                                                <Tabs value={inputViewMode} onValueChange={(v) => setInputViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                    <TabsList className="h-6 rounded-md">
                                                        <TabsTrigger value="preview" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger>
                                                        <TabsTrigger value="schema" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger>
                                                    </TabsList>
                                                </Tabs>
                                                <CopyButton text={inputString} />
                                            </div>
                                        }
                                    />
                                    {isTruncated && inputViewMode === 'preview' && (
                                        <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                                            Preview truncated for display performance
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </TabsContent>

                    <TabsContent value="transform" className="mt-2">
                        <JavaScriptCodeEditor
                            value={localTransform}
                            onChange={handleTransformChange}
                            readOnly={readOnly}
                            minHeight="150px"
                            maxHeight="250px"
                            resizable={true}
                            isTransformEditor={true}
                        />
                    </TabsContent>

                    <TabsContent value="schema" className="mt-2">
                        <div className="space-y-3">
                            <JsonSchemaEditor
                                value={(localSchema && localSchema.trim().length > 0) ? localSchema : null}
                                onChange={handleSchemaChange}
                                isOptional={true}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </Card>
    );
}; */

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
    failedSteps = [],
    showOutputSignal,
    onConfigEditingChange
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
    showOutputSignal?: number;
    onConfigEditingChange?: (editing: boolean) => void;
}) => {
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');

    // Switch to output tab when signal changes
    useEffect(() => {
        if (showOutputSignal) {
            setActivePanel('output');
        }
    }, [showOutputSignal]);

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
                            <>
                                <Button
                                    size="sm"
                                    onClick={onExecuteStep}
                                    disabled={!canExecute || isExecuting}
                                    title={!canExecute ? "Execute previous steps first" : "Test this step (no self-healing)"}
                                >
                                    {isExecuting ? (
                                        <>
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                                            Running...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-3 w-3 mr-1" />
                                            Run Step
                                        </>
                                    )}
                                </Button>
                                <HelpTooltip text="Executes this step configuration directly without instruction validation or self-healing. Useful for quick testing." />
                            </>
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
                            <TabsList className="h-9 p-1 rounded-md">
                                <TabsTrigger value="input" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                                    <FileJson className="h-4 w-4" /> Step Input
                                </TabsTrigger>
                                <TabsTrigger value="config" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                                    <Settings className="h-4 w-4" /> Step Config
                                </TabsTrigger>
                                <TabsTrigger value="output" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
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
                                    inputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
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
                                            minHeight="150px"
                                            maxHeight="300px"
                                            resizable={true}
                                            overlay={
                                                <div className="flex items-center gap-1">
                                                    <Tabs value={inputViewMode} onValueChange={(v) => setInputViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                        <TabsList className="h-6 p-0.5 rounded-md">
                                                            <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                            <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                        </TabsList>
                                                    </Tabs>
                                                    <CopyButton text={inputString} />
                                                </div>
                                            }
                                        />
                                        {isTruncated && inputViewMode === 'preview' && (
                                            <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                                                Preview truncated for display performance
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {activePanel === 'config' && (
                        <div className="mt-1">
                            <WorkflowStepConfigurator
                                step={step}
                                isLast={true}
                                onEdit={onEdit}
                                onRemove={() => { }}
                                integrations={integrations}
                                onEditingChange={onConfigEditingChange}
                            />
                        </div>
                    )}

                    {activePanel === 'output' && (
                        <div>
                            {(() => {
                                // Check if step has failed and we should show error
                                const stepFailed = failedSteps?.includes(step.id);
                                const errorResult = stepFailed && (!stepResult || typeof stepResult === 'string');

                                // Check if result is pending
                                const isPending = !stepFailed && stepResult === undefined;

                                let outputString = '';
                                let isTruncated = false;
                                if (!isPending) {
                                    if (errorResult) {
                                        // Show error message if step failed
                                        if (stepResult) {
                                            if (typeof stepResult === 'string') {
                                                // Truncate long error strings
                                                outputString = stepResult.length > MAX_DISPLAY_SIZE ?
                                                    stepResult.substring(0, MAX_DISPLAY_SIZE) + '\n... [Error message truncated]' :
                                                    stepResult;
                                            } else {
                                                const displayData = truncateForDisplay(stepResult);
                                                outputString = displayData.value;
                                            }
                                        } else {
                                            outputString = '{\n  "error": "Step execution failed"\n}';
                                        }
                                    } else if (outputViewMode === 'schema') {
                                        const schemaObj = inferSchema(stepResult || {});
                                        outputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                                    } else {
                                        const displayData = truncateForDisplay(stepResult);
                                        outputString = displayData.value;
                                        isTruncated = displayData.truncated;
                                    }
                                }
                                const showEmptyWarning = !stepFailed && !isPending && !errorResult && outputViewMode === 'preview' && isEmptyData(outputString || '');
                                return (
                                    <>
                                        {stepFailed && (
                                            <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                                                <p className="text-xs text-destructive">Step execution failed</p>
                                            </div>
                                        )}
                                        {isPending ? (
                                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                                                <Database className="h-6 w-6 mb-2 opacity-50" />
                                                <p className="text-xs">No output yet</p>
                                                <p className="text-[10px] mt-1">Test this step to see its output</p>
                                            </div>
                                        ) : (
                                            <>
                                                <JsonCodeEditor
                                                    value={outputString}
                                                    readOnly={true}
                                                    minHeight="150px"
                                                    maxHeight="300px"
                                                    resizable={true}
                                                    overlay={
                                                        <div className="flex items-center gap-1">
                                                            {!errorResult && (
                                                                <Tabs value={outputViewMode} onValueChange={(v) => setOutputViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                                    <TabsList className="h-6 p-0.5 rounded-md">
                                                                        <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                                        <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                                    </TabsList>
                                                                </Tabs>
                                                            )}
                                                            <CopyButton text={outputString} />
                                                        </div>
                                                    }
                                                />
                                                {showEmptyWarning && (
                                                    <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 px-2">
                                                        ⚠ No data returned. Is this expected?
                                                    </div>
                                                )}
                                                {isTruncated && outputViewMode === 'preview' && (
                                                    <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                                                        Preview truncated for display performance
                                                    </div>
                                                )}
                                            </>
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
    currentExecutingStepIndex,
    transformResult,
    readOnly = false,
    payload,
    inputSchema,
    onInputSchemaChange,
    headerActions,
    navigateToFinalSignal,
    showStepOutputSignal,
    focusStepId
}: WorkflowStepGalleryProps) {
    const [activeIndex, setActiveIndex] = useState(1); // Default to first workflow step, not payload
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [containerWidth, setContainerWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const trackRef = useState<HTMLElement | null>(null)[0] as unknown as React.MutableRefObject<HTMLDivElement | null> || { current: null } as any;
    const listRef = useRef<HTMLDivElement | null>(null);
    const [isConfiguratorEditing, setIsConfiguratorEditing] = useState<boolean>(false);

    // Local workflowId editor state to reduce re-renders
    const [localWorkflowId, setLocalWorkflowId] = useState<string>(workflowId ?? '');
    const [isEditingWorkflowId, setIsEditingWorkflowId] = useState<boolean>(false);
    useEffect(() => {
        if (!isEditingWorkflowId) {
            setLocalWorkflowId(workflowId ?? '');
        }
    }, [workflowId, isEditingWorkflowId]);
    const commitWorkflowIdIfChanged = () => {
        if (onWorkflowIdChange && localWorkflowId !== (workflowId ?? '')) {
            onWorkflowIdChange(localWorkflowId);
        }
        setIsEditingWorkflowId(false);
    };

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

    // Local working payload that survives navigation; start from prop payload
    const [workingPayload, setWorkingPayload] = useState<any>(payload || {});

    // Keep workingPayload seeded from prop once (or when prop meaningfully changes shape)
    useEffect(() => {
        // Only seed if workingPayload is still empty object to prevent wiping user edits
        if (!workingPayload || Object.keys(workingPayload).length === 0) {
            setWorkingPayload(payload || {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payload]);

    // Wire payload editor to update workingPayload in parent via onPayloadChange and locally
    const handlePayloadJsonChange = (jsonString: string) => {
        if (onPayloadChange) onPayloadChange(jsonString);
        try {
            const parsed = JSON.parse(jsonString);
            setWorkingPayload(parsed);
        } catch {
            // ignore invalid while typing
        }
    };

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
            data: { payload: workingPayload, inputSchema },
            stepResult: undefined,
            evolvingPayload: workingPayload || {}
        },
        // Regular steps
        ...steps.map((step, index) => ({
            type: 'step',
            data: step,
            stepResult: stepResultsMap[step.id],
            evolvingPayload: buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, index - 1)
        })),
        ...(finalTransform !== undefined ? [{
            type: 'transform',
            data: { transform: finalTransform, responseSchema },
            stepResult: finalResult,
            evolvingPayload: buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, steps.length - 1)
        }] : []),
        {
            type: 'final',
            data: { result: transformResult || finalResult },
            stepResult: transformResult || finalResult,
            evolvingPayload: buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, steps.length)
        }
    ];

    // Compute current item
    const currentItem = workflowItems[activeIndex];
    const indicatorIndices = workflowItems.map((_, idx) => idx);

    const handleNavigation = (direction: 'prev' | 'next') => {
        if (isConfiguratorEditing) return;
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
        if (isConfiguratorEditing) return;

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
    }, [navigateToFinalSignal]);

    useEffect(() => {
        if (!showStepOutputSignal || !focusStepId) return;
        const idx = steps.findIndex((s: any) => s.id === focusStepId);
        if (idx >= 0) {
            const globalIdx = idx + 1; // +1 to account for payload card at index 0
            setActiveIndex(globalIdx);
            const container = listRef.current;
            const card = container?.children?.[globalIdx] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showStepOutputSignal, focusStepId]);

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
                                        value={localWorkflowId}
                                        onChange={(e) => {
                                            setLocalWorkflowId(e.target.value);
                                            setIsEditingWorkflowId(true);
                                        }}
                                        onBlur={commitWorkflowIdIfChanged}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                commitWorkflowIdIfChanged();
                                            } else if (e.key === 'Escape') {
                                                setLocalWorkflowId(workflowId ?? '');
                                                setIsEditingWorkflowId(false);
                                            }
                                        }}
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
                                    const CARD_WIDTH = 228; // px (matches card classes above)
                                    const ARROW_WIDTH = 24; // px (ChevronRight ~20px, add buffer)
                                    const GUTTER = 8; // px
                                    const BLOCK_WIDTH = CARD_WIDTH + ARROW_WIDTH;
                                    const cardsToShow = Math.max(1, Math.min(
                                        workflowItems.length,
                                        Math.floor((((containerWidth || windowWidth) + GUTTER) / (BLOCK_WIDTH + GUTTER)))
                                    ));

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
                                                                isRunningAll={isExecuting && currentExecutingStepIndex === (globalIdx - 1)}
                                                                isTesting={
                                                                    item.type === 'step' ? isExecutingStep === (globalIdx - 1) :
                                                                        item.type === 'transform' ? isExecutingTransform :
                                                                            false
                                                                }
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
                                onClick={() => { if (isConfiguratorEditing) return; setActiveIndex(globalIdx); }}
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
                            <PayloadMiniStepCard
                                payload={currentItem.data.payload}
                                inputSchema={currentItem.data.inputSchema}
                                onChange={handlePayloadJsonChange}
                                onInputSchemaChange={onInputSchemaChange}
                                readOnly={readOnly}
                            />
                        ) : currentItem.type === 'transform' ? (
                            <FinalTransformMiniStepCard
                                transform={currentItem.data.transform}
                                responseSchema={currentItem.data.responseSchema}
                                onTransformChange={onFinalTransformChange}
                                onResponseSchemaChange={onResponseSchemaChange}
                                readOnly={readOnly}
                                onExecuteTransform={onExecuteTransform}
                                isExecutingTransform={isExecutingTransform}
                                canExecute={steps.every((s: any) => completedSteps.includes(s.id))}
                                transformResult={transformResult || finalResult}
                                stepInputs={currentItem.evolvingPayload}
                            />
                        ) : currentItem.type === 'final' ? (
                            <FinalResultsCard
                                result={currentItem.data.result}
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
                                canExecute={canExecuteStep(activeIndex - 1, completedSteps, { steps } as any, stepResultsMap)}
                                isExecuting={isExecutingStep === activeIndex - 1}
                                integrations={integrations}
                                readOnly={readOnly}
                                failedSteps={failedSteps}
                                showOutputSignal={showStepOutputSignal}
                                onConfigEditingChange={setIsConfiguratorEditing}
                            />
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
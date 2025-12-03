import { Button } from '@/src/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { downloadJson } from '@/src/lib/download-utils';
import { isEmptyData } from '@/src/lib/general-utils';
import { Download, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { JsonCodeEditor } from '../../../editors/JsonCodeEditor';
import { useDataProcessor } from '../../hooks/use-data-processor';
import { CopyButton } from '../../shared/CopyButton';

interface StepResultTabProps {
    step: any;
    stepIndex: number;
    stepResult?: any;
    failedSteps?: string[];
    isExecuting?: boolean;
    isGlobalExecuting?: boolean;
    currentExecutingStepIndex?: number;
    isActive?: boolean;
}

export function StepResultTab({
    step,
    stepIndex,
    stepResult,
    failedSteps = [],
    isExecuting,
    isGlobalExecuting,
    currentExecutingStepIndex,
    isActive = true,
}: StepResultTabProps) {
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');

    const outputProcessor = useDataProcessor(stepResult, isActive);

    const handleOutputViewModeChange = (mode: 'preview' | 'schema') => {
        setOutputViewMode(mode);
        if (mode === 'schema') {
            outputProcessor.computeSchema();
        }
    };

    const stepFailed = failedSteps?.includes(step.id);
    const errorResult = stepFailed && (!stepResult || typeof stepResult === 'string');
    const isPending = !stepFailed && stepResult === undefined;
    const isActivelyRunning = !!(isExecuting || (isGlobalExecuting && currentExecutingStepIndex === stepIndex));

    let outputString = '';
    let isTruncated = false;
    
    if (!isPending) {
        if (errorResult) {
            if (stepResult) {
                outputString = stepResult.length > 50000 ?
                    stepResult.substring(0, 50000) + '\n... [Error message truncated]' :
                    stepResult;
            } else {
                outputString = '{\n  "error": "Step execution failed"\n}';
            }
        } else {
            outputString = outputViewMode === 'schema'
                ? outputProcessor.schema?.displayString || ''
                : outputProcessor.preview?.displayString || '';
            isTruncated = outputViewMode === 'schema'
                ? outputProcessor.schema?.truncated || false
                : outputProcessor.preview?.truncated || false;
        }
    }

    const showEmptyWarning = !stepFailed && !isPending && !errorResult && outputViewMode === 'preview' && isEmptyData(outputString || '');

    return (
        <div>
            {errorResult ? (
                <div className="flex flex-col items-start justify-start p-4 border rounded-lg bg-muted/30 border-border">
                    <div className="flex items-center gap-2 mb-2">
                        <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                        <p className="text-sm font-semibold text-red-500 dark:text-red-400">Step Error</p>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap font-mono w-full overflow-x-auto">
                        {outputString || 'Step execution failed'}
                    </pre>
                    <p className="text-xs text-muted-foreground mt-2">
                        Use the "Fix Step" button above to automatically repair the step configuration.
                    </p>
                </div>
            ) : isPending ? (
                isActivelyRunning ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                            <span className="text-xs">Currently running...</span>
                        </div>
                        <p className="text-[10px]">Step results will be shown shortly</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                        <div className="text-xs mb-1">No result yet</div>
                        <p className="text-[10px]">Run this step to see results</p>
                    </div>
                )
            ) : (
                <>
                    <JsonCodeEditor
                        value={outputString}
                        readOnly={true}
                        minHeight="300px"
                        maxHeight="600px"
                        resizable={true}
                        overlay={
                            <div className="flex items-center gap-1">
                                {(outputProcessor.isComputingPreview || outputProcessor.isComputingSchema) && (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                                <Tabs value={outputViewMode} onValueChange={(v) => handleOutputViewModeChange(v as 'preview' | 'schema')} className="w-auto">
                                    <TabsList className="h-6 p-0.5 rounded-md">
                                        <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                        <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                                <CopyButton text={outputString} />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => downloadJson(stepResult, `step_${step.id}_result.json`)}
                                    title="Download step result as JSON"
                                >
                                    <Download className="h-3 w-3" />
                                </Button>
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
        </div>
    );
}


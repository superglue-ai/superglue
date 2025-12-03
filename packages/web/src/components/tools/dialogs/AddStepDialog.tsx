'use client';

import { useTools } from '@/src/app/tools-context';
import { Button } from '@/src/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Textarea } from '@/src/components/ui/textarea';
import { cn } from '@/src/lib/general-utils';
import { ExecutionStep } from '@superglue/shared';
import { AlertTriangle, Loader2, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGenerateStepConfig } from '../hooks/use-generate-step-config';
import { IntegrationSelector } from '../shared/IntegrationSelector';

interface AddStepDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (stepId: string, instruction: string, integrationId?: string) => void;
    onConfirmTool?: (steps: ExecutionStep[]) => void;
    onConfirmGenerate?: (step: ExecutionStep) => void;
    existingStepIds: string[];
    stepInput?: Record<string, any>;
    currentToolId?: string;
}

export function AddStepDialog({
    open,
    onOpenChange,
    onConfirm,
    onConfirmTool,
    onConfirmGenerate,
    existingStepIds,
    stepInput,
    currentToolId
}: AddStepDialogProps) {
    const [stepId, setStepId] = useState('');
    const [instruction, setInstruction] = useState('');
    const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'scratch' | 'tool'>('scratch');
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { tools, isInitiallyLoading, isRefreshing, refreshTools } = useTools();
    const { generateConfig, isGenerating, error: generateError } = useGenerateStepConfig();

    useEffect(() => {
        refreshTools();
    }, []);

    useEffect(() => {
        if (open) {
            setStepId('');
            setInstruction('');
            setSelectedIntegrationId('');
            setError('');
        }
    }, [open]);

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setError('');
            setInstruction('');
            setSelectedIntegrationId('');
            setSelectedToolId(null);
            setActiveTab('scratch');
            setSearchQuery('');
        }
        onOpenChange(newOpen);
    };

    const filteredTools = tools.filter(tool => {
        // Exclude tools with no steps
        if (!tool.steps || tool.steps.length === 0) return false;
        // Exclude the current tool
        if (currentToolId && tool.id === currentToolId) return false;
        
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            tool.id?.toLowerCase().includes(query) ||
            tool.instruction?.toLowerCase().includes(query)
        );
    });

    const handleConfirmScratch = () => {
        const trimmedId = stepId.trim();

        if (!trimmedId) {
            setError('Step ID is required');
            return;
        }

        if (existingStepIds.includes(trimmedId)) {
            setError(`Step with ID "${trimmedId}" already exists`);
            return;
        }

        if (!selectedIntegrationId) {
            setError('Please select an integration');
            return;
        }

        onConfirm(trimmedId, instruction.trim(), selectedIntegrationId);
        setError('');
    };

    const handleConfirmTool = () => {
        if (!selectedToolId) {
            setError('Please select a tool');
            return;
        }

        const selectedTool = tools.find(t => t.id === selectedToolId);
        if (!selectedTool || !selectedTool.steps) {
            setError('Selected tool has no steps');
            return;
        }

        // Rename imported steps if they collide with existing step IDs
        const usedIds = new Set(existingStepIds);
        const renamedSteps = selectedTool.steps.map(step => {
            let newId = step.id;
            if (usedIds.has(newId)) {
                let suffix = 2;
                while (usedIds.has(`${step.id}${suffix}`)) {
                    suffix++;
                }
                newId = `${step.id}${suffix}`;
            }
            usedIds.add(newId);
            
            if (newId !== step.id) {
                return {
                    ...step,
                    id: newId,
                    apiConfig: step.apiConfig ? { ...step.apiConfig, id: newId } : undefined
                };
            }
            return step;
        });

        if (onConfirmTool) {
            onConfirmTool(renamedSteps);
        }
        setError('');
        setSelectedToolId(null);
    };

    const handleConfirmGenerate = async () => {
        const trimmedId = stepId.trim();
        const trimmedInstruction = instruction.trim();

        if (!trimmedId) {
            setError('Step ID is required');
            return;
        }

        if (existingStepIds.includes(trimmedId)) {
            setError(`Step with ID "${trimmedId}" already exists`);
            return;
        }

        if (!selectedIntegrationId) {
            setError('Please select an integration');
            return;
        }

        if (!trimmedInstruction) {
            setError('Instruction is required to automatically generate step');
            return;
        }

        try {
            setError('');
            const result = await generateConfig({
                currentStepConfig: {
                    id: trimmedId,
                    instruction: trimmedInstruction
                },
                stepInput: stepInput,
                integrationId: selectedIntegrationId
            });

            const newStep: ExecutionStep = {
                id: trimmedId,
                integrationId: selectedIntegrationId,
                apiConfig: {
                    ...result.config,
                    id: trimmedId,
                    instruction: trimmedInstruction
                },
                loopSelector: result.dataSelector
            };

            if (onConfirmGenerate) {
                onConfirmGenerate(newStep);
            }
            handleOpenChange(false);
        } catch (err: any) {
            setError(err.message || 'Failed to generate step configuration');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add</DialogTitle>
                    <DialogDescription>
                        Create a new step from scratch or import steps from an existing tool
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scratch' | 'tool')} className="overflow-hidden w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="scratch">Add new step</TabsTrigger>
                        <TabsTrigger value="tool">Import tool</TabsTrigger>
                    </TabsList>

                    <TabsContent value="scratch" className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="step-id" className="text-sm font-medium">
                                Step ID
                            </label>
                            <Input
                                id="step-id"
                                value={stepId}
                                onChange={(e) => {
                                    setStepId(e.target.value);
                                    setError('');
                                }}
                                placeholder="e.g., fetch_users"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Integration
                            </label>
                            <IntegrationSelector
                                value={selectedIntegrationId}
                                onValueChange={(value) => {
                                    setSelectedIntegrationId(value);
                                    setError('');
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="step-instruction" className="text-sm font-medium">
                                Instruction
                            </label>
                            <Textarea
                                id="step-instruction"
                                value={instruction}
                                onChange={(e) => {
                                    setInstruction(e.target.value);
                                    setError('');
                                }}
                                placeholder="e.g., Fetch all users from the API"
                                rows={4}
                                className="resize-none focus:ring-inset"
                            />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="tool" className="space-y-4 py-4">
                        {isInitiallyLoading || isRefreshing ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : tools.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No tools found
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Input
                                        placeholder="Search by ID or instruction..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                                <div className="border rounded-lg max-h-[400px] overflow-y-auto overflow-x-hidden">
                                    {filteredTools.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            No tools match your search
                                        </div>
                                    ) : (
                                        filteredTools.map((tool) => (
                                            <button
                                                key={tool.id}
                                                onClick={() => {
                                                    setSelectedToolId(tool.id);
                                                    setError('');
                                                }}
                                                className={cn(
                                                    "w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors overflow-hidden",
                                                    selectedToolId === tool.id && "bg-accent"
                                                )}
                                            >
                                                <div className="font-medium truncate">{tool.id}</div>
                                                {tool.instruction && (
                                                    <div className="text-sm text-muted-foreground truncate mt-1">
                                                        {tool.instruction}
                                                    </div>
                                                )}
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {tool.steps?.length || 0} step{tool.steps?.length !== 1 ? 's' : ''}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                                {error && (
                                    <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    {activeTab === 'scratch' ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={handleConfirmScratch}
                                disabled={isGenerating}
                            >
                                Add Step
                            </Button>
                            <Button
                                onClick={handleConfirmGenerate}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <WandSparkles className="h-4 w-4" />
                                        Generate Step
                                    </>
                                )}
                            </Button>
                        </>
                    ) : (
                        <Button
                            onClick={handleConfirmTool}
                            disabled={isInitiallyLoading}
                        >
                            Import Steps
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

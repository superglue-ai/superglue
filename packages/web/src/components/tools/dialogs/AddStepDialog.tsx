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
import { cn } from '@/src/lib/general-utils';
import { ExecutionStep } from '@superglue/client';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IntegrationSelector } from '../shared/IntegrationSelector';

interface AddStepDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (stepId: string, instruction: string, integrationId?: string) => void;
    onConfirmTool?: (steps: ExecutionStep[]) => void;
    existingStepIds: string[];
    defaultId?: string;
}

export function AddStepDialog({
    open,
    onOpenChange,
    onConfirm,
    onConfirmTool,
    existingStepIds,
    defaultId
}: AddStepDialogProps) {
    const [stepId, setStepId] = useState(defaultId || '');
    const [instruction, setInstruction] = useState('');
    const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'scratch' | 'tool'>('scratch');
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { tools, isInitiallyLoading, isRefreshing, refreshTools } = useTools();

    useEffect(() => {
        refreshTools();
    }, []);

    useEffect(() => {
        if (open && defaultId) {
            setStepId(defaultId);
            setInstruction('');
            setError('');
        }
    }, [open, defaultId]);

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
            setError('Step ID cannot be empty');
            return;
        }

        if (!selectedIntegrationId) {
            setError('Please select an integration');
            return;
        }

        if (existingStepIds.includes(trimmedId)) {
            setError(`Step with ID "${trimmedId}" already exists`);
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

        if (onConfirmTool) {
            onConfirmTool(selectedTool.steps);
        }
        setError('');
        setSelectedToolId(null);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl" onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeTab === 'scratch') {
                        handleConfirmScratch();
                    } else {
                        handleConfirmTool();
                    }
                }
            }}>
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

                    <TabsContent value="scratch" className="space-y-4 py-4 overflow-hidden">
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
                                triggerClassName={cn(error && !selectedIntegrationId && "border-destructive")}
                            />
                        </div>
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
                                className={cn(error && !stepId && "border-destructive")}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="step-instruction" className="text-sm font-medium">
                                Instruction
                            </label>
                            <Input
                                id="step-instruction"
                                value={instruction}
                                onChange={(e) => {
                                    setInstruction(e.target.value);
                                }}
                                placeholder="e.g., Fetch all users from the API"
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
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
                                    <p className="text-sm text-destructive">{error}</p>
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
                    <Button
                        onClick={activeTab === 'scratch' ? handleConfirmScratch : handleConfirmTool}
                        disabled={isInitiallyLoading}
                    >
                        {activeTab === 'scratch' ? 'Add Step' : 'Import Steps'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

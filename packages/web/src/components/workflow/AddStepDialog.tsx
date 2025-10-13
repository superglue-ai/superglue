import { useConfig } from '@/src/app/config-context';
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
import { cn } from '@/src/lib/utils';
import { ExecutionStep, SuperglueClient, Workflow } from '@superglue/client';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AddStepDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (stepId: string) => void;
    onConfirmWorkflow?: (steps: ExecutionStep[]) => void;
    existingStepIds: string[];
    defaultId?: string;
}

export function AddStepDialog({
    open,
    onOpenChange,
    onConfirm,
    onConfirmWorkflow,
    existingStepIds,
    defaultId
}: AddStepDialogProps) {
    const [stepId, setStepId] = useState(defaultId || '');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'scratch' | 'workflow'>('scratch');
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loadingWorkflows, setLoadingWorkflows] = useState(false);
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const config = useConfig();
    
    const client = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
    });

    useEffect(() => {
        if (open && defaultId) {
            setStepId(defaultId);
            setError('');
        }
    }, [open, defaultId]);

    useEffect(() => {
        if (open && activeTab === 'workflow' && workflows.length === 0) {
            loadWorkflows();
        }
    }, [open, activeTab]);

    const loadWorkflows = async () => {
        setLoadingWorkflows(true);
        try {
            const result = await client.listWorkflows(100, 0);
            setWorkflows(result.items || []);
        } catch (error) {
            console.error('Error loading workflows:', error);
            setError('Failed to load workflows');
        } finally {
            setLoadingWorkflows(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setError('');
            setSelectedWorkflowId(null);
            setActiveTab('scratch');
            setSearchQuery('');
        }
        onOpenChange(newOpen);
    };

    const filteredWorkflows = workflows.filter(workflow => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            workflow.id?.toLowerCase().includes(query) ||
            workflow.instruction?.toLowerCase().includes(query)
        );
    });

    const handleConfirmScratch = () => {
        const trimmedId = stepId.trim();
        
        if (!trimmedId) {
            setError('Step ID cannot be empty');
            return;
        }
        
        if (existingStepIds.includes(trimmedId)) {
            setError(`Step with ID "${trimmedId}" already exists`);
            return;
        }
        
        onConfirm(trimmedId);
        setError('');
    };

    const handleConfirmWorkflow = () => {
        if (!selectedWorkflowId) {
            setError('Please select a workflow');
            return;
        }

        const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
        if (!selectedWorkflow || !selectedWorkflow.steps) {
            setError('Selected workflow has no steps');
            return;
        }

        if (onConfirmWorkflow) {
            onConfirmWorkflow(selectedWorkflow.steps);
        }
        setError('');
        setSelectedWorkflowId(null);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add Steps</DialogTitle>
                    <DialogDescription>
                        Create a new step from scratch or import steps from an existing workflow
                    </DialogDescription>
                </DialogHeader>
                
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scratch' | 'workflow')} className="overflow-hidden w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="scratch">From Scratch</TabsTrigger>
                        <TabsTrigger value="workflow">From Workflow</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="scratch" className="space-y-4 py-4 overflow-hidden">
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleConfirmScratch();
                                    }
                                }}
                                placeholder="e.g., fetch_users"
                                className={cn(error && "border-destructive")}
                                autoFocus
                            />
                            {error && (
                                <p className="text-sm text-destructive">{error}</p>
                            )}
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="workflow" className="space-y-4 py-4">
                        {loadingWorkflows ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : workflows.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No workflows found
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
                                    {filteredWorkflows.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            No workflows match your search
                                        </div>
                                    ) : (
                                        filteredWorkflows.map((workflow) => (
                                            <button
                                                key={workflow.id}
                                                onClick={() => {
                                                    setSelectedWorkflowId(workflow.id);
                                                    setError('');
                                                }}
                                                className={cn(
                                                    "w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors overflow-hidden",
                                                    selectedWorkflowId === workflow.id && "bg-accent"
                                                )}
                                            >
                                                <div className="font-medium truncate">{workflow.id}</div>
                                                {workflow.instruction && (
                                                    <div className="text-sm text-muted-foreground truncate mt-1">
                                                        {workflow.instruction}
                                                    </div>
                                                )}
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {workflow.steps?.length || 0} step{workflow.steps?.length !== 1 ? 's' : ''}
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
                        onClick={activeTab === 'scratch' ? handleConfirmScratch : handleConfirmWorkflow}
                        disabled={loadingWorkflows}
                    >
                        {activeTab === 'scratch' ? 'Add Step' : 'Import Steps'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


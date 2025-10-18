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
import { ExecutionStep, SuperglueClient, Workflow as Tool } from '@superglue/client';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AddStepDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (stepId: string) => void;
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
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'scratch' | 'tool'>('scratch');
    const [tools, setTools] = useState<Tool[]>([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
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
        if (open && activeTab === 'tool' && tools.length === 0) {
            loadTools();
        }
    }, [open, activeTab]);

    const loadTools = async () => {
        setLoadingTools(true);
        try {
            const result = await client.listWorkflows(1000, 0);
            setTools(result.items?.filter(tool => tool.steps?.length > 0) || []);
        } catch (error) {
            console.error('Error loading tools:', error);
            setError('Failed to load tools');
        } finally {
            setLoadingTools(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setError('');
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
        
        if (existingStepIds.includes(trimmedId)) {
            setError(`Step with ID "${trimmedId}" already exists`);
            return;
        }
        
        onConfirm(trimmedId);
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
                    
                    <TabsContent value="tool" className="space-y-4 py-4">
                        {loadingTools ? (
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
                        disabled={loadingTools}
                    >
                        {activeTab === 'scratch' ? 'Add Step' : 'Import Steps'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


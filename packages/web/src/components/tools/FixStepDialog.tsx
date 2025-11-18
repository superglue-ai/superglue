import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/src/components/ui/dialog';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useGenerateStepConfig } from './hooks/use-generate-step-config';
import { useToast } from '@/src/hooks/use-toast';

interface FixStepDialogProps {
    open: boolean;
    onClose: () => void;
    step: any;
    stepInput?: Record<string, any>;
    integrationId?: string;
    errorMessage?: string;
    onSuccess: (newConfig: any) => void;
    onAutoHeal?: () => Promise<void>;
}

export function FixStepDialog({
    open,
    onClose,
    step,
    stepInput,
    integrationId,
    errorMessage,
    onSuccess,
    onAutoHeal,
}: FixStepDialogProps) {
    const [instruction, setInstruction] = useState(step?.apiConfig?.instruction || '');
    const [isAutoHealing, setIsAutoHealing] = useState(false);
    const [showExperimental, setShowExperimental] = useState(false);
    const { generateConfig, isGenerating, error } = useGenerateStepConfig();
    const { toast } = useToast();

    const handleRebuild = async () => {
        if (!instruction.trim()) {
            toast({
                title: 'Instruction required',
                description: 'Please provide an instruction for what this step should do.',
                variant: 'destructive',
            });
            return;
        }

        try {
            const updatedStepConfig = {
                ...step?.apiConfig,
                instruction: instruction.trim(),
            };

            const newConfig = await generateConfig({
                currentStepConfig: updatedStepConfig,
                stepInput,
                integrationId,
                errorMessage,
            });

            toast({
                title: 'Step fixed successfully',
                description: 'The step configuration has been updated.',
            });

            onSuccess(newConfig);
            handleClose();
        } catch (err) {
            toast({
                title: 'Failed to fix step',
                description: error || 'An error occurred while generating the step configuration.',
                variant: 'destructive',
            });
        }
    };

    const handleAutoHeal = async () => {
        if (!onAutoHeal) return;
        
        try {
            setIsAutoHealing(true);
            await onAutoHeal();
            handleClose();
        } catch (err: any) {
            toast({
                title: 'Auto-heal failed',
                description: err.message || 'Failed to automatically fix the step.',
                variant: 'destructive',
            });
        } finally {
            setIsAutoHealing(false);
        }
    };

    const handleClose = () => {
        setInstruction(step?.apiConfig?.instruction || '');
        setIsAutoHealing(false);
        setShowExperimental(false);
        onClose();
    };

    const isProcessing = isGenerating || isAutoHealing;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Fix Step Configuration</DialogTitle>
                    <DialogDescription>
                        Update the instruction and regenerate the step configuration.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div>
                        <Textarea
                            id="instruction"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="Describe what this step should do..."
                            className="min-h-[150px] text-sm"
                            disabled={isProcessing}
                            autoFocus
                        />
                    </div>

                    {errorMessage && (
                        <div className="space-y-1">
                            <Label className="text-xs font-medium text-destructive">
                                Step Error Details passed along
                            </Label>
                            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2">
                                <p className="text-xs font-mono break-words text-muted-foreground">
                                    {errorMessage.length > 200 
                                        ? `${errorMessage.substring(0, 200)}...` 
                                        : errorMessage}
                                </p>
                            </div>
                        </div>
                    )}

                    <Button
                        onClick={handleRebuild}
                        disabled={isProcessing || !instruction.trim()}
                        className="w-full"
                    >
                        {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isGenerating ? 'Fixing...' : 'Fix Step'}
                    </Button>

                    {onAutoHeal && (
                        <div>
                            <button
                                type="button"
                                onClick={() => setShowExperimental(!showExperimental)}
                                className="w-full flex items-center gap-1.5 py-2 hover:bg-muted/50 transition-colors rounded text-left"
                                disabled={isProcessing}
                            >
                                {showExperimental ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="text-sm text-muted-foreground">Try Iterative Execution and Healing</span>
                            </button>
                            
                            {showExperimental && (
                                <div className="pt-2 pb-3 space-y-3">
                                    <p className="text-xs text-muted-foreground">
                                        AI will execute the step repeatedly, analyzing errors and adjusting the configuration until it succeeds or reaches the retry limit.
                                    </p>
                                    
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-medium">Risks:</p>
                                        <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                                            <li>Makes multiple API calls with potentially incorrect configurations</li>
                                        </ul>
                                    </div>

                                    <Button
                                        onClick={handleAutoHeal}
                                        disabled={isProcessing}
                                        variant="outline"
                                        className="w-full"
                                        size="sm"
                                    >
                                        {isAutoHealing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                        {isAutoHealing ? 'Healing...' : 'Start Iterative Healing'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        disabled={isProcessing}
                    >
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

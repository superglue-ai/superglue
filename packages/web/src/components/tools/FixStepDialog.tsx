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
import { Loader2, RefreshCw, WandSparkles } from 'lucide-react';
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
    onAutoHeal?: (updatedInstruction: string) => Promise<void>;
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
            await onAutoHeal(instruction.trim());
            handleClose();
        } catch (err: any) {
            toast({
                title: 'Failed to fix step',
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

                    <div className="space-y-2 text-xs text-muted-foreground">
                        <p>Choose how to fix this step:</p>
                        
                        <p>
                            <strong>Fix Step:</strong> Generates new configuration without executing the step.
                        </p>
                        
                        {onAutoHeal && (
                            <>
                                <p>
                                    <strong>Fix Step & Execute:</strong> Runs the step, analyzes errors, and regenerates the config in a loop until it succeeds or reaches 10 iterations.
                                </p>
                                
                                <p className="italic">
                                    Warning: The Fix Step & Execute makes multiple API calls with potentially incorrect configurations.
                                </p>
                            </>
                        )}
                    </div>

                </div>

                <DialogFooter className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        disabled={isProcessing}
                    >
                        Cancel
                    </Button>
                    
                    <div className="flex items-center gap-2">
                        {onAutoHeal && (
                            <Button
                                onClick={handleAutoHeal}
                                disabled={isProcessing || !instruction.trim()}
                                variant="outline"
                            >
                                {isAutoHealing ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                {isAutoHealing ? 'Fixing...' : 'Fix Step & Execute'}
                            </Button>
                        )}
                        
                        <Button
                            onClick={handleRebuild}
                            disabled={isProcessing || !instruction.trim()}
                        >
                            {isGenerating ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <WandSparkles className="mr-2 h-4 w-4" />
                            )}
                            {isGenerating ? 'Fixing...' : 'Fix Step'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

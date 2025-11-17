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
import { Loader2 } from 'lucide-react';
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
}

export function FixStepDialog({
    open,
    onClose,
    step,
    stepInput,
    integrationId,
    errorMessage,
    onSuccess,
}: FixStepDialogProps) {
    const [instruction, setInstruction] = useState(step?.apiConfig?.instruction || '');
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
            // Update the step config with the new instruction before sending to SDK
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

    const handleClose = () => {
        setInstruction(step?.apiConfig?.instruction || '');
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Fix Step</DialogTitle>
                    <DialogDescription>
                        Update the step instruction. The AI will regenerate the step configuration based on your updated instruction.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="instruction" className="text-sm font-medium">
                            Step Instruction
                        </Label>
                        <Textarea
                            id="instruction"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="Describe what this step should do..."
                            className="min-h-[200px] text-sm"
                            autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                            Edit the instruction to describe what changes you want to make to this step.
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-destructive">
                                Previous Error
                            </Label>
                            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                                <p className="text-xs text-muted-foreground mb-1">
                                    This error will be sent to the AI to help fix the step:
                                </p>
                                <p className="text-sm font-mono break-words">
                                    {errorMessage}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={isGenerating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleRebuild}
                        disabled={isGenerating || !instruction.trim()}
                    >
                        {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Rebuild Step
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

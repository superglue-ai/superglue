import { Button } from '@/src/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/src/components/ui/dialog';
import { Textarea } from '@/src/components/ui/textarea';
import { useToast } from '@/src/hooks/use-toast';
import { Loader2, WandSparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useGenerateTransform } from '../hooks/use-generate-transform';

interface FixTransformDialogProps {
    open: boolean;
    onClose: () => void;
    currentTransform: string;
    responseSchema?: any;
    stepData: Record<string, any>;
    errorMessage?: string;
    onSuccess: (newTransform: string, transformedData: any) => void;
}

export function FixTransformDialog({
    open,
    onClose,
    currentTransform,
    responseSchema,
    stepData,
    errorMessage,
    onSuccess,
}: FixTransformDialogProps) {
    const [fixCommand, setFixCommand] = useState('');
    const { generateTransform, isGenerating, error } = useGenerateTransform();
    const { toast } = useToast();

    const handleFix = async () => {
        if (!fixCommand.trim()) {
            toast({
                title: 'Instruction required',
                description: 'Please provide a fix instruction.',
                variant: 'destructive',
            });
            return;
        }

        try {
            const result = await generateTransform({
                currentTransform,
                responseSchema,
                stepData,
                errorMessage,
                instruction: fixCommand.trim(),
            });

            toast({
                title: 'Transform fixed successfully',
                description: 'The transform code has been updated.',
            });

            onSuccess(result.transformCode, result.data);
            handleClose();
        } catch (err: any) {
            toast({
                title: 'Failed to fix transform',
                description: err?.message || 'An error occurred while generating the transform.',
                variant: 'destructive',
            });
        }
    };

    const handleClose = () => {
        if (!isGenerating) {
            setFixCommand('');
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-4 h-6 w-6"
                    onClick={handleClose}
                    disabled={isGenerating}
                    aria-label="Close dialog"
                >
                    <X className="h-4 w-4" />
                </Button>
                <DialogHeader>
                    <DialogTitle>Fix Transform</DialogTitle>
                    <DialogDescription>
                        Describe what you want to fix in the transform code. This instruction will guide the auto-repair process to fix the transform.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div>
                        <Textarea
                            id="fixCommand"
                            value={fixCommand}
                            onChange={(e) => setFixCommand(e.target.value)}
                            placeholder="What do you want to fix? (e.g., 'Fix the data mapping to include user email')"
                            className="min-h-[120px] text-sm"
                            disabled={isGenerating}
                            autoFocus
                        />
                    </div>

                    {errorMessage && (
                        <div className="space-y-1">
                            <div className="text-xs font-medium text-destructive">
                                Transform Error
                            </div>
                            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2">
                                <p className="text-xs font-mono break-words text-muted-foreground">
                                    {errorMessage.length > 300 
                                        ? `${errorMessage.substring(0, 300)}...` 
                                        : errorMessage}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleFix}
                        disabled={isGenerating || !fixCommand.trim()}
                    >
                        {isGenerating ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <WandSparkles className="mr-2 h-4 w-4" />
                        )}
                        {isGenerating ? 'Fixing...' : 'Fix Transform'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


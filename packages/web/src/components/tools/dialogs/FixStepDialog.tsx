import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useToast } from "@/src/hooks/use-toast";
import { isAbortError } from "@/src/lib/general-utils";
import { HelpCircle, Loader2, RefreshCw, Square, WandSparkles, X } from "lucide-react";
import { useState } from "react";
import { useGenerateStepConfig } from "../hooks/use-generate-step-config";

interface FixStepDialogProps {
  open: boolean;
  onClose: () => void;
  step: any;
  stepInput?: Record<string, any>;
  integrationId?: string;
  errorMessage?: string;
  onSuccess: (newConfig: any) => void;
  onAutoHeal?: (updatedInstruction: string) => Promise<void>;
  onAbort?: () => void;
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
  onAbort,
}: FixStepDialogProps) {
  const [instruction, setInstruction] = useState(step?.apiConfig?.instruction || "");
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const { generateConfig, isGenerating, error } = useGenerateStepConfig();
  const { toast } = useToast();

  const handleRebuild = async () => {
    if (!instruction.trim()) {
      toast({
        title: "Instruction required",
        description: "Please provide an instruction for what this step should do.",
        variant: "destructive",
      });
      return;
    }

    try {
      const updatedStepConfig = {
        ...step?.apiConfig,
        instruction: instruction.trim(),
      };

      const result = await generateConfig({
        currentStepConfig: updatedStepConfig,
        stepInput,
        integrationId,
        errorMessage,
      });

      // Result now has shape: { config: ApiConfig, dataSelector: string }
      const updatedStep = {
        ...step,
        apiConfig: result.config,
        loopSelector: result.dataSelector,
      };

      toast({
        title: "Step fixed successfully",
        description: "The step configuration has been updated.",
      });

      onSuccess(updatedStep);
      handleClose();
    } catch (err) {
      toast({
        title: "Failed to fix step",
        description: error || "An error occurred while generating the step configuration.",
        variant: "destructive",
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
      // Don't show error toast if execution was aborted by user
      if (!isAbortError(err.message)) {
        toast({
          title: "Failed to fix step",
          description: err.message || "Failed to automatically fix the step.",
          variant: "destructive",
        });
      }
    } finally {
      setIsAutoHealing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      setInstruction(step?.apiConfig?.instruction || "");
      onClose();
    }
  };

  const isProcessing = isGenerating || isAutoHealing;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl border border-border/60">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 h-6 w-6"
          onClick={handleClose}
          disabled={isProcessing}
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </Button>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Fix Step Configuration</DialogTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center"
                    aria-label="Help information about fixing steps"
                  >
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-pointer" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="right">
                  <div className="space-y-2">
                    <p>
                      <strong>Fix Step:</strong> Generates new configuration without executing the
                      step.
                    </p>
                    {onAutoHeal && (
                      <p>
                        <strong>Fix Step & Execute:</strong> Runs the step, analyzes errors, and
                        regenerates the config in a loop until it succeeds or reaches 10 iterations.
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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

          {onAutoHeal && (
            <div className="text-xs text-muted-foreground italic">
              Warning: The Fix Step & Execute makes multiple API calls with potentially incorrect
              configurations.
            </div>
          )}
        </div>

        <DialogFooter>
          {onAutoHeal &&
            (isAutoHealing && onAbort ? (
              <Button onClick={onAbort} variant="outline">
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            ) : (
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
                {isAutoHealing ? "Fixing..." : "Fix Step & Execute"}
              </Button>
            ))}

          <Button onClick={handleRebuild} disabled={isProcessing || !instruction.trim()}>
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="mr-2 h-4 w-4" />
            )}
            {isGenerating ? "Fixing..." : "Fix Step"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { OctagonAlert, X } from "lucide-react";
import { useState } from "react";

interface ModifyStepConfirmDialogProps {
  open: boolean;
  stepId: string;
  stepName?: string;
  onConfirm: (skipFutureConfirmations: boolean) => void;
  onCancel: () => void;
}

export function ModifyStepConfirmDialog({
  open,
  stepId,
  stepName,
  onConfirm,
  onCancel,
}: ModifyStepConfirmDialogProps) {
  const [skipFuture, setSkipFuture] = useState(false);

  const handleConfirm = () => {
    onConfirm(skipFuture);
    setSkipFuture(false); // Reset for next time dialog opens
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
            e.preventDefault();
            handleConfirm();
          }
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 h-6 w-6"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
              <OctagonAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <AlertDialogTitle>Confirm Step Execution</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            The next step <span className="font-medium text-foreground">{stepName || stepId}</span>{" "}
            has the potential to modify data on the system it connects to.
            <br />
            <br />
            Do you want to continue executing this step?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="skip-future"
            checked={skipFuture}
            onCheckedChange={(checked) => setSkipFuture(checked === true)}
          />
          <label
            htmlFor="skip-future"
            className="text-sm text-muted-foreground cursor-pointer select-none"
          >
            Don't ask again this session
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Inspect Step</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Continue Execution</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

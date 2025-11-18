import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/src/components/ui/alert-dialog';
import { OctagonAlert } from 'lucide-react';

interface ModifyStepConfirmDialogProps {
  open: boolean;
  stepId: string;
  stepName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ModifyStepConfirmDialog({
  open,
  stepId,
  stepName,
  onConfirm,
  onCancel,
}: ModifyStepConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
              <OctagonAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <AlertDialogTitle>Confirm Step Execution</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            The next step <span className="font-medium text-foreground">{stepName || stepId}</span> has the potential to modify data on the system it connects to.
            <br /><br />
            Do you want to continue executing this step?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Continue Execution
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


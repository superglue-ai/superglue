import { useConfig } from "@/src/app/config-context";
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
import { tokenRegistry } from "@/src/lib/token-registry";
import { SuperglueClient, Tool } from "@superglue/shared";

interface DeleteConfigDialogProps {
  config: Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (deletedId: string) => void;
}

export function DeleteConfigDialog({
  config,
  isOpen,
  onClose,
  onDeleted,
}: DeleteConfigDialogProps) {
  const superglueConfig = useConfig();

  const handleDelete = async () => {
    if (!config) return;

    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
      });
      await superglueClient.deleteWorkflow(config.id);
      const deletedId = config.id;
      onClose();

      if (onDeleted) {
        onDeleted(deletedId);
      }
    } catch (error) {
      console.error("Error deleting config:", error);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
            e.preventDefault();
            handleDelete();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this tool. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

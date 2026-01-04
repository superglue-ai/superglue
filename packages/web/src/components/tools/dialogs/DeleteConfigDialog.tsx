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
import { ApiConfig, SuperglueClient, Tool } from "@superglue/shared";

interface DeleteConfigDialogProps {
  config: ApiConfig | Tool | null;
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

      let deletePromise;
      const configType = (config as any)?.type;

      if (configType === "api") {
        deletePromise = superglueClient.deleteApi(config.id);
      } else {
        // Default to tool/workflow deletion
        deletePromise = superglueClient.deleteWorkflow(config.id);
      }

      await deletePromise;

      const deletedId = config.id;
      onClose();

      if (onDeleted) {
        onDeleted(deletedId);
      }
    } catch (error) {
      console.error("Error deleting config:", error);
    }
  };

  const isApi = (config as any)?.type === "api";

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
            This will permanently delete this {isApi ? "configuration" : "tool"}. This action cannot
            be undone.
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

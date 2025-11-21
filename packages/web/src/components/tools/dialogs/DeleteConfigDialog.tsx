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
import { ApiConfig, SuperglueClient, Workflow as Tool } from "@superglue/client";

interface DeleteConfigDialogProps {
  config: ApiConfig | Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (deletedId: string) => void;
}

export function DeleteConfigDialog({ config, isOpen, onClose, onDeleted }: DeleteConfigDialogProps) {
  const superglueConfig = useConfig();

  const handleDelete = async () => {
    if (!config) return;

    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });

      let deletePromise;

      switch ((config as any)?.type) {
        case 'api':
          deletePromise = superglueClient.deleteApi(config.id);
          break;
        case 'tool':
          deletePromise = superglueClient.deleteWorkflow(config.id);
          break;
        default:
          console.error('Unknown config type for deletion:', (config as any)?.type);
          return;
      }

      await deletePromise;

      const deletedId = config.id;
      onClose();
      
      if (onDeleted) {
        onDeleted(deletedId);
      }
    } catch (error) {
      console.error('Error deleting config:', error);
    }
  };

  const isApi = (config as any)?.type === 'api';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleDelete();
        }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this {isApi ? 'configuration' : 'tool'}. This action cannot be undone.
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


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
import { createSuperglueClient } from "@/src/lib/client-utils";
import { ApiConfig, Tool } from "@superglue/shared";

interface ArchiveConfigDialogProps {
  config: ApiConfig | Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onArchived?: (archivedId: string) => void;
}

export function ArchiveConfigDialog({ config, isOpen, onClose, onArchived }: ArchiveConfigDialogProps) {
  const superglueConfig = useConfig();

  const handleArchive = async () => {
    if (!config) return;

    try {
      const client = createSuperglueClient(superglueConfig.superglueEndpoint);
      await client.archiveWorkflow(config.id, true);

      const archivedId = config.id;
      onClose();
      
      if (onArchived) {
        onArchived(archivedId);
      }
    } catch (error) {
      console.error('Error archiving config:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleArchive();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent onKeyDown={handleKeyDown}>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this tool?</AlertDialogTitle>
          <AlertDialogDescription>
            This tool will be archived and hidden from the tools list. You can restore it later by enabling "Show archived" in the tools list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


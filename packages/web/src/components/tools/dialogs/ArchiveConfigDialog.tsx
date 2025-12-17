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
import { ApiConfig, Tool, ToolSchedule } from "@superglue/shared";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface ArchiveConfigDialogProps {
  config: ApiConfig | Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onArchived?: (archivedId: string) => void;
}

export function ArchiveConfigDialog({ config, isOpen, onClose, onArchived }: ArchiveConfigDialogProps) {
  const superglueConfig = useConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [activeSchedules, setActiveSchedules] = useState<ToolSchedule[]>([]);

  useEffect(() => {
    const checkSchedules = async () => {
      if (!config || !isOpen) {
        setActiveSchedules([]);
        return;
      }

      setIsLoading(true);
      try {
        const client = createSuperglueClient(superglueConfig.superglueEndpoint);
        const schedules = await client.listWorkflowSchedules(config.id);
        setActiveSchedules(schedules.filter(s => s.enabled));
      } catch (error) {
        console.error('Error checking schedules:', error);
        setActiveSchedules([]);
      } finally {
        setIsLoading(false);
      }
    };

    checkSchedules();
  }, [config, isOpen, superglueConfig.superglueEndpoint]);

  const handleArchive = async () => {
    if (!config || activeSchedules.length > 0) return;

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
    if (e.key === 'Enter' && activeSchedules.length === 0 && !isLoading) {
      e.preventDefault();
      handleArchive();
    }
  };

  const hasActiveSchedules = activeSchedules.length > 0;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent onKeyDown={handleKeyDown}>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this tool?</AlertDialogTitle>
          <AlertDialogDescription>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking for active schedules...
              </span>
            ) : hasActiveSchedules ? (
              <span className="text-destructive">
                This tool has {activeSchedules.length} active schedule{activeSchedules.length > 1 ? 's' : ''}. 
                Please disable all schedules before archiving.
              </span>
            ) : (
              "This tool will be archived and hidden from the tools list. You can restore it later by enabling \"Show archived\" in the tools list."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleArchive} 
            disabled={isLoading || hasActiveSchedules}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


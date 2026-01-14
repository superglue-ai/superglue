import { useConfig } from "@/src/app/config-context";
import { useSchedules } from "@/src/app/schedules-context";
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
import { Tool } from "@superglue/shared";
import { useMemo } from "react";

interface ArchiveConfigDialogProps {
  config: Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onArchived?: (archivedId: string) => void;
}

export function ArchiveConfigDialog({
  config,
  isOpen,
  onClose,
  onArchived,
}: ArchiveConfigDialogProps) {
  const superglueConfig = useConfig();
  const { getSchedulesForTool, isInitiallyLoading } = useSchedules();

  const activeSchedules = useMemo(() => {
    if (!config) return [];
    return getSchedulesForTool(config.id).filter((s) => s.enabled);
  }, [config, getSchedulesForTool]);

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
      console.error("Error archiving config:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === "Enter" &&
      (e.target as HTMLElement).tagName !== "BUTTON" &&
      activeSchedules.length === 0 &&
      !isInitiallyLoading
    ) {
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
            {hasActiveSchedules ? (
              <span className="text-destructive">
                This tool has {activeSchedules.length} active schedule
                {activeSchedules.length > 1 ? "s" : ""}. Please disable all schedules before
                archiving.
              </span>
            ) : (
              'This tool will be archived and hidden from the tools list. You can restore it later by enabling "Show archived" in the tools list.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArchive}
            disabled={hasActiveSchedules || isInitiallyLoading}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { Tool } from "@superglue/shared";
import { Archive, ArchiveRestore, CopyPlus, Edit2, MoreVertical } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ArchiveConfigDialog } from "./dialogs/ArchiveConfigDialog";
import { DuplicateToolDialog } from "./dialogs/DuplicateToolDialog";
import { RenameToolDialog } from "./dialogs/RenameToolDialog";

interface ToolActionsMenuProps {
  tool: Tool;
  onArchived?: () => void;
  onUnarchived?: () => void;
  onRenamed?: (newId: string) => void;
  onDuplicated?: (newId: string) => void;
  onRestored?: () => void;
  disabled?: boolean;
  showLabel?: boolean;
}

export function ToolActionsMenu({
  tool,
  onArchived,
  onUnarchived,
  onRenamed,
  onDuplicated,
  onRestored,
  disabled = false,
  showLabel = false,
}: ToolActionsMenuProps) {
  const config = useConfig();
  const { refreshTools } = useTools();

  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const handleRenamed = (newId: string) => {
    refreshTools();
    onRenamed?.(newId);
  };

  const handleDuplicated = (newId: string) => {
    refreshTools();
    onDuplicated?.(newId);
  };

  const handleArchived = () => {
    refreshTools();
    if (onArchived) {
      onArchived();
    }
  };

  const handleUnarchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const client = createSuperglueClient(config.superglueEndpoint);
    await client.archiveWorkflow(tool.id, false);
    refreshTools();
    if (onUnarchived) {
      onUnarchived();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={showLabel ? "sm" : "icon"}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
            className={
              showLabel ? "h-8 gap-1.5 text-muted-foreground hover:text-foreground" : undefined
            }
          >
            <MoreVertical className={showLabel ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {showLabel && <span className="text-xs">More</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => setShowRenameDialog(true)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
            <CopyPlus className="h-4 w-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          {tool.archived ? (
            <DropdownMenuItem onClick={handleUnarchive}>
              <ArchiveRestore className="h-4 w-4 mr-2" />
              Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameToolDialog
        tool={tool}
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onRenamed={handleRenamed}
      />

      <DuplicateToolDialog
        tool={tool}
        isOpen={showDuplicateDialog}
        onClose={() => setShowDuplicateDialog(false)}
        onDuplicated={handleDuplicated}
      />

      <ArchiveConfigDialog
        config={tool}
        isOpen={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        onArchived={handleArchived}
      />

      <VersionHistoryDialog
        tool={tool}
        isOpen={showVersionHistoryDialog}
        onClose={() => setShowVersionHistoryDialog(false)}
        onRestored={() => {
          refreshTools();
          onRestored?.();
        }}
      />
    </>
  );
}

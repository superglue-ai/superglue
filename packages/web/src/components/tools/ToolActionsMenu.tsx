import { useArchiveTool } from "@/src/queries/tools";
import { cn } from "@/src/lib/general-utils";
import { Tool } from "@superglue/shared";
import { Archive, ArchiveRestore, CopyPlus, Download, Edit2, MoreVertical } from "lucide-react";
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
import { ExportToolDialog } from "./ExportToolDialog";

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
  const archiveTool = useArchiveTool();

  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleRenamed = (newId: string) => {
    onRenamed?.(newId);
  };

  const handleDuplicated = (newId: string) => {
    onDuplicated?.(newId);
  };

  const handleArchived = () => {
    onArchived?.();
  };

  const handleUnarchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    archiveTool.mutate({ id: tool.id, archived: false }, { onSuccess: () => onUnarchived?.() });
  };

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="glass"
            size={showLabel ? "sm" : "icon"}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "rounded-full",
              showLabel && "h-8 gap-1.5 text-muted-foreground hover:text-foreground",
            )}
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
          <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
            <Download className="h-4 w-4 mr-2" />
            Export
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

      <ExportToolDialog
        tool={tool}
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
    </>
  );
}

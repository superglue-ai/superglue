import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { createSuperglueClient, isValidToolName, validateToolName } from "@/src/lib/client-utils";
import { Tool } from "@superglue/shared";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface RenameToolDialogProps {
  tool: Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onRenamed?: (newId: string) => void;
}

export function RenameToolDialog({ tool, isOpen, onClose, onRenamed }: RenameToolDialogProps) {
  const config = useConfig();
  const { tools, refreshTools } = useTools();
  const [newToolName, setNewToolName] = useState("");
  const [error, setError] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    if (isOpen && tool) {
      setNewToolName(tool.id);
      setError("");
    }
  }, [isOpen, tool]);

  const handleClose = () => {
    setNewToolName("");
    setError("");
    onClose();
  };

  const handleRename = async () => {
    if (!tool) return;

    const trimmedName = newToolName.trim();

    const validationError = validateToolName(trimmedName);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (trimmedName === tool.id) {
      setError("New name must be different from current name");
      return;
    }

    const existingTool = tools.find((t) => t.id === trimmedName);
    if (existingTool) {
      setError("A tool with this name already exists");
      return;
    }

    try {
      setIsRenaming(true);
      const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);

      const result = await client.renameWorkflow(tool.id, trimmedName);

      await refreshTools();
      handleClose();

      if (onRenamed) {
        onRenamed(trimmedName);
      }
    } catch (error: any) {
      console.error("Error renaming tool:", error);
      setError(error.message || "Failed to rename tool");
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isRenaming && (e.target as HTMLElement).tagName !== "BUTTON") {
            e.preventDefault();
            handleRename();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Rename Tool</DialogTitle>
          <DialogDescription>
            Enter a new name for this tool. Associated schedules will be updated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rename-name">New Name</Label>
            <Input
              id="rename-name"
              value={newToolName}
              onChange={(e) => {
                const value = e.target.value;
                if (isValidToolName(value)) {
                  setNewToolName(value);
                  setError("");
                }
              }}
              placeholder="Enter new tool name"
              disabled={isRenaming}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isRenaming}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={isRenaming}>
            {isRenaming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Renaming...
              </>
            ) : (
              "Rename"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useTools, useRenameTool } from "@/src/queries/tools";
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
import { isValidToolName, validateToolName } from "@/src/lib/client-utils";
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
  const { tools } = useTools();
  const renameTool = useRenameTool();
  const [newToolName, setNewToolName] = useState("");
  const [error, setError] = useState("");

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

    renameTool.mutate(
      { oldId: tool.id, newId: trimmedName },
      {
        onSuccess: () => {
          handleClose();
          onRenamed?.(trimmedName);
        },
        onError: (error: any) => {
          console.error("Error renaming tool:", error);
          setError(error.message || "Failed to rename tool");
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !renameTool.isPending &&
            (e.target as HTMLElement).tagName !== "BUTTON"
          ) {
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
              disabled={renameTool.isPending}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={renameTool.isPending}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={renameTool.isPending}>
            {renameTool.isPending ? (
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

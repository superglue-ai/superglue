import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { FolderPicker, UNCATEGORIZED } from "@/src/components/tools/FolderPicker";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { createSuperglueClient, isValidToolName, validateToolName } from "@/src/lib/client-utils";
import { Tool } from "@superglue/shared";
import { ChevronDown, Folder, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface SaveToolDialogProps {
  tool: Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (savedTool: Tool) => void;
}

export function SaveToolDialog({ tool, isOpen, onClose, onSaved }: SaveToolDialogProps) {
  const config = useConfig();
  const { tools } = useTools();
  const [toolName, setToolName] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const existingFolders = useMemo(() => {
    const folders = new Set<string>();
    tools.forEach(t => {
      if (t.folder) folders.add(t.folder);
    });
    return Array.from(folders).sort();
  }, [tools]);

  useEffect(() => {
    if (isOpen && tool) {
      setToolName(tool.id);
      setSelectedFolder(tool.folder);
      setError("");
    }
  }, [isOpen, tool]);

  const handleClose = () => {
    setToolName("");
    setSelectedFolder(undefined);
    setError("");
    onClose();
  };

  const handleSave = async () => {
    if (!tool) return;

    const trimmedName = toolName.trim();
    
    const validationError = validateToolName(trimmedName);
    if (validationError) {
      setError(validationError);
      return;
    }

    const existingTool = tools.find(t => t.id === trimmedName);
    if (existingTool) {
      setError("A tool with this name already exists");
      return;
    }

    try {
      setIsSaving(true);
      const client = createSuperglueClient(config.superglueEndpoint);

      const toolToSave = { ...tool, id: trimmedName, folder: selectedFolder || undefined };
      const saved = await client.upsertWorkflow(trimmedName, toolToSave as any);
      if (!saved) throw new Error('Failed to save tool');

      handleClose();
      
      if (onSaved) {
        onSaved(saved);
      }
    } catch (error: any) {
      console.error('Error saving tool:', error);
      setError(error.message || 'Failed to save tool');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent onKeyDown={(e) => {
        if (e.key === 'Enter' && !isSaving && (e.target as HTMLElement).tagName !== 'BUTTON') {
          e.preventDefault();
          handleSave();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Save Tool</DialogTitle>
          <DialogDescription>
            Give your tool a name. This will be used to identify and run your tool.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tool-name">Tool Name</Label>
            <Input
              id="tool-name"
              value={toolName}
              onChange={(e) => {
                const value = e.target.value;
                if (isValidToolName(value)) {
                  setToolName(value);
                  setError("");
                }
              }}
              placeholder="Enter tool name"
              disabled={isSaving}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Folder (optional)</Label>
            <FolderPicker
              value={selectedFolder}
              onChange={(folder) => setSelectedFolder(folder ?? undefined)}
              folders={existingFolders}
              disabled={isSaving}
              width="w-[300px]"
              trigger={
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={isSaving}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{selectedFolder || UNCATEGORIZED}</span>
                  </div>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              }
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

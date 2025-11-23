import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { createSuperglueClient, isValidToolName, validateToolName } from "@/src/lib/client-utils";
import { Workflow as Tool } from "@superglue/client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

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
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && tool) {
      setToolName(tool.id);
      setError("");
    }
  }, [isOpen, tool]);

  const handleClose = () => {
    setToolName("");
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

      const toolToSave = { ...tool, id: trimmedName };
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
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>
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


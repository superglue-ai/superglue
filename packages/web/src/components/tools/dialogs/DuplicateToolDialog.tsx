import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { isValidToolName, validateToolName } from "@/src/lib/client-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { SuperglueClient, Workflow as Tool } from "@superglue/client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface DuplicateToolDialogProps {
  tool: Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onDuplicated?: (newId: string) => void;
}

export function DuplicateToolDialog({ tool, isOpen, onClose, onDuplicated }: DuplicateToolDialogProps) {
  const config = useConfig();
  const { tools, refreshTools } = useTools();
  const [duplicateToolName, setDuplicateToolName] = useState("");
  const [duplicateError, setDuplicateError] = useState("");
  const [isDuplicating, setIsDuplicating] = useState(false);

  useEffect(() => {
    if (isOpen && tool) {
      setDuplicateToolName(`${tool.id}-copy`);
      setDuplicateError("");
    }
  }, [isOpen, tool]);

  const handleClose = () => {
    setDuplicateToolName("");
    setDuplicateError("");
    onClose();
  };

  const handleDuplicateConfirm = async () => {
    if (!tool) return;

    const trimmedName = duplicateToolName.trim();
    
    const validationError = validateToolName(trimmedName);
    if (validationError) {
      setDuplicateError(validationError);
      return;
    }

    const existingTool = tools.find(t => t.id === trimmedName);
    if (existingTool) {
      setDuplicateError("A tool with this name already exists");
      return;
    }

    try {
      setIsDuplicating(true);
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });

      const duplicatedTool: Tool = {
        ...tool,
        id: trimmedName,
      };

      await superglueClient.upsertWorkflow(trimmedName, duplicatedTool as any);
      
      await refreshTools();
      handleClose();
      
      if (onDuplicated) {
        onDuplicated(trimmedName);
      }
    } catch (error: any) {
      console.error('Error duplicating tool:', error);
      setDuplicateError(error.message || 'Failed to duplicate tool');
    } finally {
      setIsDuplicating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent onKeyDown={(e) => {
        if (e.key === 'Enter' && !isDuplicating && (e.target as HTMLElement).tagName !== 'BUTTON') {
          e.preventDefault();
          handleDuplicateConfirm();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Duplicate Tool</DialogTitle>
          <DialogDescription>
            Enter a new name for the duplicated tool
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="duplicate-name">Tool Name</Label>
            <Input
              id="duplicate-name"
              value={duplicateToolName}
              onChange={(e) => {
                const value = e.target.value;
                if (isValidToolName(value)) {
                  setDuplicateToolName(value);
                  setDuplicateError("");
                }
              }}
              placeholder="Enter tool name"
              disabled={isDuplicating}
            />
            {duplicateError && (
              <p className="text-sm text-red-500">{duplicateError}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDuplicating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDuplicateConfirm}
            disabled={isDuplicating}
          >
            {isDuplicating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Duplicating...
              </>
            ) : (
              "Duplicate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


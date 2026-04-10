import { useSystems } from "@/src/queries/systems";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Tool, System } from "@superglue/shared";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createExportData,
  downloadJson,
  getSystemsForTool,
  getSensitiveCredentialFields,
  hasSensitiveCredentials,
} from "./import-export-utils";

interface ExportToolDialogProps {
  tool: Tool | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportToolDialog({ tool, isOpen, onClose }: ExportToolDialogProps) {
  const { systems } = useSystems();
  const [includeSystems, setIncludeSystems] = useState(true);
  const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);

  const referencedSystems = useMemo(() => {
    if (!tool) return [];
    return getSystemsForTool(tool, systems);
  }, [tool, systems]);

  const showWarning = includeSystems && hasSensitiveCredentials(referencedSystems);

  const handleExport = () => {
    if (!tool) return;

    const exportData = createExportData({
      tools: [tool],
      systems: includeSystems ? referencedSystems : [],
    });

    const filename = `${tool.id}${includeSystems && referencedSystems.length > 0 ? "-with-systems" : ""}.json`;
    downloadJson(exportData, filename);
    handleClose();
  };

  const handleClose = () => {
    setIncludeSystems(true);
    setAcknowledgedWarning(false);
    onClose();
  };

  const canExport = tool && (!showWarning || acknowledgedWarning);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        overlayClassName="bg-background/60 backdrop-blur-sm"
        className="shadow-2xl shadow-black/20"
      >
        <DialogHeader>
          <DialogTitle>Export Tool</DialogTitle>
          <DialogDescription>
            Export <span className="font-mono text-foreground">{tool?.id}</span> as JSON
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {referencedSystems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-systems"
                  checked={includeSystems}
                  onCheckedChange={(checked) => {
                    setIncludeSystems(checked === true);
                    if (!checked) setAcknowledgedWarning(false);
                  }}
                />
                <label
                  htmlFor="include-systems"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Include referenced systems ({referencedSystems.length})
                </label>
              </div>

              {includeSystems && (
                <div className="ml-6 space-y-1">
                  {referencedSystems.map((system) => {
                    const sensitiveFields = getSensitiveCredentialFields(system);
                    return (
                      <div
                        key={`${system.id}-${system.environment || "prod"}`}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <span className="font-mono">{system.id}</span>
                        {system.environment && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              system.environment === "dev"
                                ? "bg-yellow-500/20 text-yellow-600"
                                : "bg-green-500/20 text-green-600"
                            }`}
                          >
                            {system.environment}
                          </span>
                        )}
                        {sensitiveFields.length > 0 && (
                          <span className="text-yellow-600 text-xs">
                            ({sensitiveFields.length} sensitive field
                            {sensitiveFields.length > 1 ? "s" : ""})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {referencedSystems.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This tool does not reference any systems.
            </p>
          )}

          {showWarning && (
            <div className="flex items-center gap-2 rounded-md border border-yellow-600/30 bg-yellow-500/10 px-3 py-2">
              <Checkbox
                id="acknowledge-warning"
                checked={acknowledgedWarning}
                onCheckedChange={(checked) => setAcknowledgedWarning(checked === true)}
              />
              <label htmlFor="acknowledge-warning" className="text-sm cursor-pointer">
                I understand credentials will be included in the export
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="glass" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="glass-primary" onClick={handleExport} disabled={!canExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

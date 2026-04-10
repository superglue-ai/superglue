"use client";

import { TunnelConnection, TunnelTarget, slugify } from "@superglue/shared";
import { cn } from "@/src/lib/general-utils";
import { useState, useCallback } from "react";
import { ArrowLeft, CheckCircle2, CloudOff } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { TunnelSelector } from "./TunnelSelector";
import { useToast } from "@/src/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useCreateSystem, useSystems } from "@/src/queries/systems";
import {
  getProtocolIcon,
  getProtocolIconName,
  generateTunnelInstructions,
  toTitleCase,
} from "@/src/lib/protocol-utils";

interface OnPremWizardProps {
  onClose?: () => void;
  className?: string;
}

type WizardStep = "select-tunnel" | "confirm-name" | "success";

export function OnPremWizard({ onClose, className }: OnPremWizardProps) {
  const [step, setStep] = useState<WizardStep>("select-tunnel");
  const { connectedTunnels, loading: tunnelsLoading } = useSystems();
  const [selectedTunnel, setSelectedTunnel] = useState<TunnelConnection | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<TunnelTarget | null>(null);
  const [systemName, setSystemName] = useState("");
  const [createdSystemId, setCreatedSystemId] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const createSystemMutation = useCreateSystem();

  const handleSelectTunnel = useCallback((tunnel: TunnelConnection) => {
    setSelectedTunnel(tunnel);
    setSelectedTarget(null);
  }, []);

  const handleSelectTarget = useCallback((target: TunnelTarget) => {
    setSelectedTarget(target);
    // Set default name from target name (converted to title case)
    setSystemName(toTitleCase(target.name));
    // Advance to name confirmation step
    setStep("confirm-name");
  }, []);

  const handleBack = useCallback(() => {
    if (step === "confirm-name") {
      setStep("select-tunnel");
    }
  }, [step]);

  const handleSubmit = useCallback(async () => {
    if (!selectedTunnel || !selectedTarget || !systemName.trim()) return;

    try {
      const protocol = (selectedTarget.protocol || "https").toLowerCase();
      const URL_SCHEME_MAP: Record<string, string> = {
        postgres: "postgres",
        postgresql: "postgres",
        mssql: "mssql",
        sqlserver: "mssql",
        redis: "redis",
        rediss: "rediss",
        sftp: "sftp",
        ftp: "ftp",
        smb: "smb",
        http: "http",
      };
      const urlScheme = URL_SCHEME_MAP[protocol] || "https";

      const needsTrailingSlash = ["sftp", "ftp", "smb"].includes(urlScheme);
      const systemUrl = `${urlScheme}://${selectedTunnel.id}.tunnel${needsTrailingSlash ? "/" : ""}`;

      const result = await createSystemMutation.mutateAsync({
        id: slugify(systemName.trim()),
        name: systemName.trim(),
        url: systemUrl,
        icon: getProtocolIconName(protocol),
        tunnel: {
          tunnelId: selectedTunnel.id,
          targetName: selectedTarget.name,
        },
        specificInstructions: generateTunnelInstructions(systemUrl, protocol),
      });

      setCreatedSystemId(result.id);
      setStep("success");
      toast({
        title: "System Created",
        description: `Successfully created private system "${systemName.trim()}"`,
      });
    } catch (error) {
      console.error("Failed to create system:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create system",
        variant: "destructive",
      });
    }
  }, [selectedTunnel, selectedTarget, systemName, toast, createSystemMutation]);

  const handleViewSystem = useCallback(() => {
    if (createdSystemId) {
      router.push(`/systems/${createdSystemId}`);
    }
    onClose?.();
  }, [createdSystemId, router, onClose]);

  // Get the icon for the selected target
  const TargetIcon = selectedTarget ? getProtocolIcon(selectedTarget.protocol) : CloudOff;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-shrink-0">
        {step === "confirm-name" && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {step === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <TargetIcon className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {step === "success" ? "System Created" : "Connect to Private System"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === "select-tunnel" && "Select a connected gateway and target"}
              {step === "confirm-name" && "Confirm the system name"}
              {step === "success" && "Configure documentation and authentication"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {step === "select-tunnel" && (
          <TunnelSelector
            tunnels={connectedTunnels}
            selectedTunnel={selectedTunnel}
            selectedTarget={selectedTarget}
            onSelectTunnel={handleSelectTunnel}
            onSelectTarget={handleSelectTarget}
            isLoading={tunnelsLoading}
          />
        )}

        {step === "confirm-name" && selectedTunnel && selectedTarget && (
          <div className="space-y-6">
            {/* Target Info */}
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TargetIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedTarget.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedTarget.protocol.toUpperCase()} via {selectedTunnel.id}
                  </p>
                </div>
              </div>
            </div>

            {/* System Name Input */}
            <div className="space-y-2">
              <Label htmlFor="name">System Name</Label>
              <Input
                id="name"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="e.g., Internal API, Production Database"
                className="h-10"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                A friendly name to identify this system in Superglue
              </p>
            </div>

            {/* Create Button */}
            <div className="pt-4">
              <Button
                onClick={handleSubmit}
                disabled={!systemName.trim() || createSystemMutation.isPending}
                className="w-full"
              >
                {createSystemMutation.isPending ? "Creating..." : "Create System"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-medium mb-2">System Created Successfully</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Your private system has been created. Now configure documentation and authentication
              (like API keys) in the system settings.
            </p>
            <Button onClick={handleViewSystem} className="min-w-[200px]">
              View System Settings
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

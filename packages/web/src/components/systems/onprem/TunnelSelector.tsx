"use client";

import { TunnelConnection, TunnelTarget } from "@superglue/shared";
import { cn } from "@/src/lib/general-utils";
import { Wifi, WifiOff, FileText } from "lucide-react";
import { getProtocolIcon, getProtocolLabel } from "@/src/lib/protocol-utils";

interface TunnelSelectorProps {
  tunnels: TunnelConnection[];
  selectedTunnel: TunnelConnection | null;
  selectedTarget: TunnelTarget | null;
  onSelectTunnel: (tunnel: TunnelConnection) => void;
  onSelectTarget: (target: TunnelTarget) => void;
  isLoading?: boolean;
}

export function TunnelSelector({
  tunnels,
  selectedTunnel,
  selectedTarget,
  onSelectTunnel,
  onSelectTarget,
  isLoading,
}: TunnelSelectorProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 w-full rounded-xl bg-muted/50 animate-pulse" />
        <div className="h-24 w-full rounded-xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (tunnels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <WifiOff className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No Gateways Connected</h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          To connect to private data sources, deploy a Gateway Agent in your VPC, on-prem network,
          or any private environment.
        </p>
        <a
          href="/docs/guides/secure-gateway"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "text-sm font-medium",
          )}
        >
          <FileText className="w-4 h-4" />
          View Setup Guide
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tunnel Selection */}
      <div>
        <h3 className="text-sm font-medium mb-3">Connected Gateways</h3>
        <div className="grid gap-3">
          {tunnels.map((tunnel) => (
            <button
              key={tunnel.id}
              onClick={() => onSelectTunnel(tunnel)}
              className={cn(
                "w-full text-left p-4 rounded-xl transition-all duration-200",
                "border",
                selectedTunnel?.id === tunnel.id
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/50 bg-muted/30 hover:border-border hover:bg-muted/50",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    selectedTunnel?.id === tunnel.id ? "bg-primary/10" : "bg-muted",
                  )}
                >
                  <Wifi
                    className={cn(
                      "w-5 h-5",
                      selectedTunnel?.id === tunnel.id ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{tunnel.id}</h4>
                  <p className="text-xs text-muted-foreground">
                    {tunnel.targets.length} target{tunnel.targets.length !== 1 ? "s" : ""} available
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Target Selection */}
      {selectedTunnel && (
        <div className="animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <h3 className="text-sm font-medium mb-3">Select Target</h3>
          <div className="grid gap-2">
            {selectedTunnel.targets.map((target) => {
              const Icon = getProtocolIcon(target.protocol);
              return (
                <button
                  key={target.name}
                  onClick={() => onSelectTarget(target)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-all duration-200",
                    "border",
                    selectedTarget?.name === target.name
                      ? "border-primary bg-primary/5"
                      : "border-border/30 bg-background hover:border-border/50 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        selectedTarget?.name === target.name
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{target.name}</span>
                      {target.description && (
                        <span className="text-xs text-muted-foreground ml-2">
                          — {target.description}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                      {getProtocolLabel(target.protocol)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

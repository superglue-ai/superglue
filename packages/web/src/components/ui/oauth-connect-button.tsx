"use client";

import { cn } from "@/src/lib/general-utils";
import { SystemIcon } from "./system-icon";
import { Loader2 } from "lucide-react";
import { findTemplateForSystem, systemOptions } from "@superglue/shared";

interface OAuthConnectButtonProps {
  system: {
    id?: string;
    name?: string;
    url?: string;
    icon?: string | null;
    templateName?: string;
  };
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function OAuthConnectButton({
  system,
  onClick,
  disabled = false,
  loading = false,
  className,
}: OAuthConnectButtonProps) {
  const templateMatch = findTemplateForSystem(system);
  const templateLabel = templateMatch
    ? systemOptions.find((opt) => opt.value === templateMatch.key)?.label
    : undefined;
  const systemName = templateLabel || system.name || system.id || "service";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
        "bg-secondary border border-border shadow-md hover:bg-secondary hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:translate-y-[1px] active:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    >
      <div
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
          "bg-muted",
        )}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <SystemIcon system={system} size={16} />
        )}
      </div>
      <div className="flex flex-col items-start min-w-0">
        <span className="font-medium text-sm flex items-center gap-2">
          {loading ? <span>Connecting...</span> : <span>Connect to {systemName}</span>}
        </span>
        <span className="text-[11px] text-muted-foreground">Authenticate with OAuth 2.0</span>
      </div>
    </button>
  );
}

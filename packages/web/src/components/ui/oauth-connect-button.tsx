"use client";

import { cn } from "@/src/lib/general-utils";
import { SystemIcon } from "./system-icon";
import { Check, Loader2 } from "lucide-react";
import { findTemplateForSystem, systemOptions } from "@superglue/shared";

interface OAuthConnectButtonProps {
  system: {
    id?: string;
    name?: string;
    urlHost?: string;
    icon?: string | null;
    templateName?: string;
  };
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  connected?: boolean;
  className?: string;
}

export function OAuthConnectButton({
  system,
  onClick,
  disabled = false,
  loading = false,
  connected = false,
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
      disabled={disabled || loading || connected}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
        connected
          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
          : "bg-secondary border border-border shadow-md hover:bg-secondary hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:translate-y-[1px] active:shadow-sm disabled:cursor-not-allowed",
        !connected && "disabled:opacity-50",
        className,
      )}
    >
      <div
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
          connected ? "bg-green-100 dark:bg-green-900/50" : "bg-muted",
        )}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : connected ? (
          <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
        ) : (
          <SystemIcon system={system} size={16} />
        )}
      </div>
      <div className="flex flex-col items-start min-w-0">
        <span
          className={cn(
            "font-medium text-sm flex items-center gap-2",
            connected && "text-green-700 dark:text-green-300",
          )}
        >
          {loading ? (
            <span>Connecting...</span>
          ) : connected ? (
            <span>Connected to {systemName}</span>
          ) : (
            <span>Connect to {systemName}</span>
          )}
        </span>
        <span
          className={cn(
            "text-[11px]",
            connected ? "text-green-600/70 dark:text-green-400/70" : "text-muted-foreground",
          )}
        >
          {connected ? "OAuth authentication successful" : "Authenticate with OAuth 2.0"}
        </span>
      </div>
    </button>
  );
}

"use client";

import { cn } from "@/src/lib/general-utils";
import { SystemIcon } from "./system-icon";
import { Check, Loader2 } from "lucide-react";
import { systemOptions } from "@superglue/shared";

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
  isConnected?: boolean;
  className?: string;
}

export function OAuthConnectButton({
  system,
  onClick,
  disabled = false,
  loading = false,
  isConnected = false,
  className,
}: OAuthConnectButtonProps) {
  const systemName =
    systemOptions.find((opt) => opt.value === system.templateName)?.label ||
    system.name ||
    system.id ||
    "Service";

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
        "bg-secondary hover:bg-secondary/80 border border-border",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isConnected && "border-green-500/50",
        className,
      )}
    >
      <div
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
          isConnected ? "bg-green-100 dark:bg-green-900/30" : "bg-muted",
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
          {isConnected ? (
            <>
              <span>Connected to {systemName}</span>
              <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
            </>
          ) : loading ? (
            <span>Connecting...</span>
          ) : (
            <span>Connect to {systemName}</span>
          )}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {isConnected ? "Click to reauthenticate" : "Authenticate with OAuth 2.0"}
        </span>
      </div>
    </button>
  );
}

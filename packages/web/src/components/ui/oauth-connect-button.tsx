"use client";

import { cn } from "@/src/lib/general-utils";
import { SystemIcon } from "./system-icon";
import { Loader2 } from "lucide-react";
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
        "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all duration-200",
        connected
          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
          : [
              "!bg-neutral-800 dark:!bg-neutral-200 !text-neutral-100 dark:!text-neutral-900",
              "backdrop-blur-sm border border-neutral-700/50 dark:border-neutral-300/50 shadow-md",
              "cursor-pointer hover:!bg-neutral-700 dark:hover:!bg-neutral-300",
              "hover:shadow-lg hover:-translate-y-px active:translate-y-0 active:shadow-sm",
              "active:scale-[0.99]",
            ],
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
            connected ? "text-green-600/70 dark:text-green-400/70" : "opacity-[0.85]",
          )}
        >
          {connected ? "Authentication successful" : "Click here to connect"}
        </span>
        <span className="text-[11px] text-muted-foreground">Authenticate with OAuth 2.0</span>
      </div>
    </button>
  );
}

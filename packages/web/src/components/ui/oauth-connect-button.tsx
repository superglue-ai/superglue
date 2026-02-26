"use client";

import { cn, resolveSystemIcon } from "@/src/lib/general-utils";
import { SystemIcon } from "./system-icon";
import { Check, Loader2 } from "lucide-react";
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
  const accentStyle = undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading || connected}
      style={!connected && !disabled ? accentStyle : undefined}
      className={cn(
        "flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-200",
        connected
          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
          : [
              "!bg-neutral-200/80 dark:!bg-white/10",
              "backdrop-blur-sm border border-border/60 shadow-md",
              "text-foreground/90 dark:text-foreground/95",
              "cursor-pointer hover:from-muted/80 hover:to-muted/50 hover:border-border/80 hover:shadow-lg hover:-translate-y-[1px]",
              "active:translate-y-[1px] active:shadow-sm",
            ],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed",
        !connected && "disabled:opacity-50",
        className,
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0",
          connected ? "bg-green-100 dark:bg-green-900/50" : "bg-muted/60 border border-border/50",
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-inherit opacity-80" />
        ) : connected ? (
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <SystemIcon system={system} size={16} />
        )}
      </div>
      <div className="flex flex-col items-start min-w-0">
        <span
          className={cn(
            "font-semibold text-sm flex items-center gap-2",
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
            "text-[12px]",
            connected ? "text-green-600/70 dark:text-green-400/70" : "opacity-[0.85]",
          )}
        >
          {connected ? "Authentication successful" : "Click here to connect"}
        </span>
      </div>
    </button>
  );
}

"use client";

import { cn } from "@/src/lib/general-utils";
import { LucideIcon } from "lucide-react";

interface ToolCallPendingStateProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  children?: React.ReactNode;
}

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent dark:via-foreground/[0.06]",
        "animate-shimmer-bar bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function ToolCallPendingState({
  icon: Icon,
  label,
  description,
  children,
}: ToolCallPendingStateProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/30 dark:border-border/20 bg-gradient-to-br from-background/80 via-muted/20 to-background/80 dark:from-background/60 dark:via-muted/10 dark:to-background/60 backdrop-blur-md p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent dark:from-primary/[0.04] pointer-events-none" />

      <div className="relative space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-foreground/[0.04] dark:bg-foreground/[0.08]">
            <Icon className="w-3.5 h-3.5 text-muted-foreground/70 animate-pulse" />
          </div>
          <span className="text-sm font-medium text-muted-foreground/80">{label}</span>
        </div>

        {description && <p className="text-xs text-muted-foreground/50 pl-[34px]">{description}</p>}

        {children ? (
          <div className="pl-[34px]">{children}</div>
        ) : (
          <div className="space-y-2.5 pl-[34px]">
            <ShimmerBar className="h-3 w-3/4" />
            <ShimmerBar className="h-3 w-1/2" />
            <ShimmerBar className="h-3 w-2/3" />
          </div>
        )}
      </div>
    </div>
  );
}

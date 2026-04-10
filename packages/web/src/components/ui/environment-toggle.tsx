"use client";
import { cn } from "@/src/lib/general-utils";
import { useEnvironment } from "@/src/app/environment-context";

interface EnvironmentToggleProps {
  className?: string;
}

export function EnvironmentToggle({ className }: EnvironmentToggleProps) {
  const { mode, setMode, hasMultiEnvSystems, isLoading } = useEnvironment();

  // Don't render if org doesn't have multi-env systems
  if (isLoading || !hasMultiEnvSystems) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5 rounded-lg",
        "bg-muted/50 border border-border/50",
        className,
      )}
    >
      <button
        onClick={() => setMode("prod")}
        className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150",
          mode === "prod"
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 shadow-sm border border-green-200 dark:border-green-800/50"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Prod
      </button>
      <button
        onClick={() => setMode("dev")}
        className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150",
          mode === "dev"
            ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 shadow-sm border border-orange-200 dark:border-orange-800/50"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Dev
      </button>
    </div>
  );
}

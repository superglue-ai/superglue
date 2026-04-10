"use client";
import { cn } from "@/src/lib/general-utils";

export type EnvironmentType = "none" | "dev" | "prod" | "both";

interface EnvironmentBadgeProps {
  type: EnvironmentType;
  className?: string;
  size?: "sm" | "default";
}

// Dev: muted orange, Prod: warm forest green
const devStyles =
  "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/50";
const prodStyles =
  "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/50";

export function EnvironmentBadge({ type, className, size = "default" }: EnvironmentBadgeProps) {
  if (type === "none") {
    return <span className={cn("text-muted-foreground text-xs", className)}>-</span>;
  }

  const sizeClasses = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  const baseClasses = "inline-flex items-center rounded-md font-medium border";

  if (type === "both") {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <span className={cn(baseClasses, sizeClasses, devStyles)}>Dev</span>
        <span className={cn(baseClasses, sizeClasses, prodStyles)}>Prod</span>
      </div>
    );
  }

  if (type === "dev") {
    return <span className={cn(baseClasses, sizeClasses, devStyles, className)}>Dev</span>;
  }

  if (type === "prod") {
    return <span className={cn(baseClasses, sizeClasses, prodStyles, className)}>Prod</span>;
  }

  return null;
}

// Toggle component for switching between prod and dev
interface EnvironmentSwitchProps {
  value: "dev" | "prod";
  onChange: (value: "dev" | "prod") => void;
  className?: string;
}

export function EnvironmentSwitch({ value, onChange, className }: EnvironmentSwitchProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5 rounded-lg",
        "bg-muted/50 border border-border/50",
        className,
      )}
    >
      <button
        onClick={() => onChange("prod")}
        className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150",
          value === "prod"
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 shadow-sm border border-green-200 dark:border-green-800/50"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Prod
      </button>
      <button
        onClick={() => onChange("dev")}
        className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150",
          value === "dev"
            ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 shadow-sm border border-orange-200 dark:border-orange-800/50"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Dev
      </button>
    </div>
  );
}

// Helper to convert environment to EnvironmentType
// DB constraint ensures environment is always 'dev' or 'prod'
export function getEnvironmentType(
  environment: "dev" | "prod",
  hasLinkedDev?: boolean,
  hasLinkedProd?: boolean,
): EnvironmentType {
  if (environment === "dev" && hasLinkedProd) return "both";
  if (environment === "prod" && hasLinkedDev) return "both";
  if (environment === "dev") return "dev";
  return "prod";
}

// Legacy component for backwards compatibility
interface EnvironmentLabelProps {
  label?: "dev" | "prod" | string | null;
  className?: string;
  size?: "sm" | "default";
}

export function EnvironmentLabel({ label, className, size = "default" }: EnvironmentLabelProps) {
  if (label === "dev") {
    return <EnvironmentBadge type="dev" className={className} size={size} />;
  }
  if (label === "prod") {
    return <EnvironmentBadge type="prod" className={className} size={size} />;
  }
  return null;
}

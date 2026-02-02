"use client";

import { resolveSystemIcon } from "@/src/lib/general-utils";
import { Blocks, icons, LucideIcon } from "lucide-react";
import { memo } from "react";

interface SystemIconProps {
  system: {
    id?: string;
    name?: string;
    urlHost?: string;
    icon?: string | null;
    templateName?: string;
  };
  size?: number;
  className?: string;
  /** Additional classes for the fallback Blocks icon */
  fallbackClassName?: string;
}

/**
 * Unified system icon component that handles all icon rendering logic.
 * Automatically resolves SimpleIcons, Lucide icons, and falls back to Blocks.
 *
 * Usage:
 * ```tsx
 * <SystemIcon system={system} size={24} />
 * ```
 */
export const SystemIcon = memo(function SystemIcon({
  system,
  size = 16,
  className = "",
  fallbackClassName = "text-muted-foreground",
}: SystemIconProps) {
  const resolved = resolveSystemIcon(system);

  if (resolved?.type === "simpleicons") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={`#${resolved.icon.hex}`}
        className={`flex-shrink-0 ${className}`}
      >
        <path d={resolved.icon.path || ""} />
      </svg>
    );
  }

  if (resolved?.type === "lucide") {
    const iconName = resolved.name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");

    const LucideIconComponent = icons[iconName as keyof typeof icons] as LucideIcon | undefined;

    if (LucideIconComponent) {
      return (
        <LucideIconComponent
          style={{ width: size, height: size }}
          className={`flex-shrink-0 ${className}`}
        />
      );
    }
  }

  return (
    <Blocks
      style={{ width: size, height: size }}
      className={`flex-shrink-0 ${fallbackClassName} ${className}`}
    />
  );
});

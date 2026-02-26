"use client";

import { resolveSystemIcon } from "@/src/lib/general-utils";
import type { System } from "@superglue/shared";
import { Blocks, icons, LucideIcon } from "lucide-react";
import { memo } from "react";

interface SystemIconProps {
  system: Partial<System>;
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
    const LucideIconComponent = getLucideIconComponent(resolved.name);

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

let _lucideIconByNormalized: Record<string, LucideIcon> | null = null;

function normalizeLucideName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function getLucideIconComponent(name: string): LucideIcon | undefined {
  if (!name) return undefined;

  // Fast path: try direct and basic pascal-case lookup.
  const direct = icons[name as keyof typeof icons] as LucideIcon | undefined;
  if (direct) return direct;

  const pascal = toPascalCase(name);
  const byPascal = icons[pascal as keyof typeof icons] as LucideIcon | undefined;
  if (byPascal) return byPascal;

  // Fallback: normalized lookup to handle cases like "grid-2x2" => "Grid2X2".
  if (!_lucideIconByNormalized) {
    _lucideIconByNormalized = {};
    for (const [key, value] of Object.entries(icons)) {
      const normalized = normalizeLucideName(key);
      if (!_lucideIconByNormalized[normalized]) {
        _lucideIconByNormalized[normalized] = value as LucideIcon;
      }
    }
  }

  return _lucideIconByNormalized[normalizeLucideName(name)];
}

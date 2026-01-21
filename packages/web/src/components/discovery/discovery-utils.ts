import type { SimpleIcon } from "simple-icons";
import { getSimpleIcon } from "@/src/lib/general-utils";
import { parseIconString, type ParsedIcon } from "@superglue/shared";

export type ResolvedIcon =
  | { type: "simpleicons"; icon: SimpleIcon }
  | { type: "lucide"; name: string }
  | { type: "fallback" };

/**
 * Get icon from discovery's ExtendedSystem icon object format
 */
export function getDiscoveryIcon(icon?: {
  name: string;
  source: "simpleicons" | "lucide";
}): ResolvedIcon {
  if (!icon) {
    return { type: "fallback" };
  }

  if (icon.source === "simpleicons") {
    const simpleIcon = getSimpleIcon(icon.name);
    if (simpleIcon) {
      return { type: "simpleicons", icon: simpleIcon };
    }
    return { type: "fallback" };
  }

  if (icon.source === "lucide") {
    return { type: "lucide", name: icon.name };
  }

  return { type: "fallback" };
}

/**
 * Get icon from a serialized icon string (e.g., "simpleicons:salesforce" or "lucide:database")
 * Also handles legacy format (just icon name without prefix, assumes simpleicons)
 */
export function getIconFromString(iconString?: string | null): ResolvedIcon {
  if (!iconString) {
    return { type: "fallback" };
  }

  const parsed = parseIconString(iconString);
  if (!parsed) {
    return { type: "fallback" };
  }

  if (parsed.source === "simpleicons") {
    const simpleIcon = getSimpleIcon(parsed.name);
    if (simpleIcon) {
      return { type: "simpleicons", icon: simpleIcon };
    }
    return { type: "fallback" };
  }

  if (parsed.source === "lucide") {
    return { type: "lucide", name: parsed.name };
  }

  return { type: "fallback" };
}

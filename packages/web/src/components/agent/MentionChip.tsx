"use client";

import { cn, resolveSystemIcon } from "@/src/lib/general-utils";
import { SystemIcon } from "@/src/components/ui/system-icon";
import type { MessageReference, MessageReferenceType } from "@superglue/shared";
import { Blocks, CircleAlert, Hammer, ListChecks } from "lucide-react";
import React from "react";

export const MENTION_TYPE_LABELS: Record<MessageReferenceType, string> = {
  tool: "Tools",
  system: "Systems",
  run: "Runs",
};

const MENTION_TYPE_SINGULAR: Record<MessageReferenceType, string> = {
  tool: "Tool",
  system: "System",
  run: "Run",
};

// Same icons as the sidebar navigation, so entity types read identically everywhere.
export const MENTION_TYPE_ICONS: Record<MessageReferenceType, React.ComponentType<any>> = {
  tool: Hammer,
  system: Blocks,
  run: ListChecks,
};

type MentionTone = "tool" | "system" | "runSuccess" | "runFailed" | "runOther";

// Chip styling per tone. Runs are coloured by outcome, everything else by entity type.
const CHIP_TONES: Record<MentionTone, string> = {
  tool: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  system: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  runSuccess: "bg-green-500/15 text-green-700 dark:text-green-300",
  runFailed: "bg-red-500/15 text-red-700 dark:text-red-300",
  runOther: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

// Background-only tints for the composer overlay, where the real text sits on top.
const HIGHLIGHT_TONES: Record<MentionTone, string> = {
  tool: "bg-blue-500/20",
  system: "bg-purple-500/20",
  runSuccess: "bg-green-500/20",
  runFailed: "bg-red-500/20",
  runOther: "bg-amber-500/20",
};

/** Runs still executing or aborted stay neutral - only a finished outcome gets green or red. */
export function mentionTone(type: MessageReferenceType, status?: string): MentionTone {
  if (type !== "run") return type;
  const normalized = (status || "").toLowerCase();
  if (normalized === "success") return "runSuccess";
  if (normalized === "failed") return "runFailed";
  return "runOther";
}

// Systems can bring their own icon (brand icon or configured Lucide name); the generic
// type icon is only the fallback. Tools and runs have no icon field in the data model.
function hasOwnEntityIcon(
  type: MessageReferenceType,
  entity?: { id?: string; name?: string; icon?: string },
) {
  if (type !== "system" || !entity) return false;
  return !!resolveSystemIcon({ id: entity.id, name: entity.name, icon: entity.icon });
}

/** Type icon on a tinted square, used to the left of every entry in the mention popover. */
export function MentionTypeIcon({
  type,
  status,
  entity,
  className,
}: {
  type: MessageReferenceType;
  status?: string;
  // Identity of the concrete entity, so its own icon can replace the generic one.
  entity?: { id?: string; name?: string; icon?: string };
  className?: string;
}) {
  const Icon = MENTION_TYPE_ICONS[type];
  const hasOwnIcon = hasOwnEntityIcon(type, entity);
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded",
        CHIP_TONES[mentionTone(type, status)],
        className,
      )}
    >
      {hasOwnIcon ? (
        <SystemIcon system={{ id: entity!.id, name: entity!.name, icon: entity!.icon }} size={12} />
      ) : (
        <Icon className="h-3 w-3" />
      )}
    </span>
  );
}

export function MentionChip({
  reference,
  text,
  missing = false,
  className,
}: {
  reference: MessageReference;
  text: string;
  // True when the referenced entity was deleted after the message was sent.
  missing?: boolean;
  className?: string;
}) {
  const Icon = MENTION_TYPE_ICONS[reference.type];
  const hasOwnIcon = hasOwnEntityIcon(reference.type, {
    id: reference.id,
    name: reference.label,
    icon: reference.icon,
  });
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 align-baseline font-medium",
        missing
          ? "bg-gray-500/15 text-gray-600 dark:text-gray-400"
          : CHIP_TONES[mentionTone(reference.type, reference.status)],
        className,
      )}
      title={
        missing
          ? `This ${MENTION_TYPE_SINGULAR[reference.type]} no longer exists or is not accessible.`
          : `${reference.type}: ${reference.id}`
      }
    >
      {hasOwnIcon ? (
        <span className="self-center shrink-0 flex">
          <SystemIcon
            system={{ id: reference.id, name: reference.label, icon: reference.icon }}
            size={12}
          />
        </span>
      ) : (
        <Icon className="w-3 h-3 self-center shrink-0" />
      )}
      {reference.label || text}
      {missing && <CircleAlert className="w-3 h-3 self-center shrink-0" />}
    </span>
  );
}

/**
 * Highlight used behind the composer textarea. Horizontal padding is cancelled out by an
 * equal negative margin so the pill never changes text metrics - otherwise the overlay
 * would drift out of alignment with the real characters.
 */
export function MentionHighlight({
  reference,
  children,
}: {
  reference: MessageReference;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded px-[3px] -mx-[3px] py-[1px]",
        HIGHLIGHT_TONES[mentionTone(reference.type, reference.status)],
      )}
    >
      {children}
    </span>
  );
}

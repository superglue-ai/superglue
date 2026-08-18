"use client";

import { cn } from "@/src/lib/general-utils";
import type { MessageReference, MessageReferenceType } from "@superglue/shared";
import type { MentionSegment } from "@/src/lib/agent/mentions";
import type { MentionGroup, MentionItem } from "./hooks/use-mention-input";
import { MENTION_TYPE_LABELS, MentionHighlight, MentionTypeIcon } from "./MentionChip";
import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/** The suggestion dropdown above a mention-capable textarea. Purely presentational. */
export function MentionPopover({
  visibleGroups,
  highlightedIndex,
  isLoading,
  groupHints,
  onSelect,
  onHoverIndex,
  onToggleGroup,
  placement = "above",
  portalAnchor,
}: {
  visibleGroups: MentionGroup[];
  highlightedIndex: number;
  isLoading: boolean;
  groupHints?: Partial<Record<MessageReferenceType, string>>;
  onSelect: (item: MentionItem) => void;
  onHoverIndex: (index: number) => void;
  onToggleGroup: (type: MessageReferenceType, level: number) => void;
  // "above" opens over the textarea (composer default), "below" underneath it.
  placement?: "above" | "below";
  // When set, the popover renders into document.body with fixed positioning anchored to
  // this element. That lifts it out of every overflow-hidden ancestor and stacking
  // context, so nothing in the page can clip or cover it.
  portalAnchor?: React.RefObject<HTMLElement | null>;
}) {
  const isEmpty = visibleGroups.length === 0;

  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = portalAnchor?.current;
    if (!el) return;
    const update = () => setAnchorRect(el.getBoundingClientRect());
    update();
    // Capture-phase scroll catches the transcript's inner scroll container too.
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [portalAnchor]);

  const usePortal = !!portalAnchor;
  if (usePortal && !anchorRect) return null;

  const portalStyle: React.CSSProperties | undefined = usePortal
    ? {
        position: "fixed",
        left: anchorRect!.left,
        width: anchorRect!.width,
        zIndex: 9999,
        ...(placement === "below"
          ? { top: anchorRect!.bottom + 8 }
          : { bottom: window.innerHeight - anchorRect!.top + 8 }),
      }
    : undefined;

  const popover = (
    <div
      style={portalStyle}
      className={cn(
        "overflow-hidden rounded-xl bg-popover border border-border shadow-lg",
        !usePortal && "absolute left-0 right-0 z-50",
        !usePortal && (placement === "below" ? "top-full mt-2" : "bottom-full mb-2"),
      )}
      // Keep focus in the textarea so the caret stays where the mention is typed.
      onMouseDown={(e) => e.preventDefault()}
    >
      {isLoading && isEmpty ? (
        <div className="px-3 py-2.5 text-sm text-muted-foreground">Loading…</div>
      ) : isEmpty ? (
        <div className="px-3 py-2.5 text-sm text-muted-foreground">
          No matching tools, systems or runs found.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto py-1">
          {visibleGroups.map((group) => {
            return (
              <div key={group.type}>
                <div className="flex items-baseline justify-between px-3 pt-2 pb-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {MENTION_TYPE_LABELS[group.type]}
                    {groupHints?.[group.type] && (
                      <span className="ml-1.5 font-normal text-muted-foreground/70">
                        {groupHints[group.type]}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70">
                    {group.matches.length}
                  </span>
                </div>
                {group.entries.map(({ item, index }) => (
                  <button
                    key={`${item.type}:${item.id}`}
                    type="button"
                    onClick={() => onSelect(item)}
                    onMouseEnter={() => onHoverIndex(index)}
                    className={cn(
                      "w-full flex items-start gap-2 px-3 py-2 text-left transition-colors",
                      index === highlightedIndex
                        ? "bg-accent text-accent-foreground"
                        : "bg-transparent",
                    )}
                  >
                    <MentionTypeIcon
                      type={item.type}
                      status={item.status}
                      entity={{ id: item.id, name: item.label, icon: item.icon }}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{item.label}</span>
                      {item.description && (
                        <span className="block text-xs text-muted-foreground truncate">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                {(group.hiddenCount > 0 || group.level > 0) && (
                  <button
                    type="button"
                    onClick={() =>
                      onToggleGroup(group.type, group.hiddenCount > 0 ? group.level + 1 : 0)
                    }
                    className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {group.hiddenCount === 0
                      ? "Show less"
                      : group.level === 0
                        ? `Show more (${group.hiddenCount} more)`
                        : `Show all ${group.matches.length} ${MENTION_TYPE_LABELS[group.type].toLowerCase()}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return usePortal ? createPortal(popover, document.body) : popover;
}

/**
 * Paints the chip backgrounds behind the real text of a textarea. Purely decorative: the
 * textarea above stays the single source of truth for text and caret. The wrapper and the
 * inner div must carry exactly the same metric classes as the textarea itself.
 */
export function MentionOverlay({
  segments,
  mirrorRef,
  wrapperClassName,
  textClassName,
}: {
  segments: MentionSegment[];
  mirrorRef: React.RefObject<HTMLDivElement | null>;
  wrapperClassName?: string;
  textClassName: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", wrapperClassName)}
    >
      <div
        ref={mirrorRef}
        className={cn(
          "w-full px-3 py-2 text-base md:text-sm",
          textClassName,
          "whitespace-pre-wrap break-words text-transparent !max-h-none !min-h-0",
        )}
      >
        {segments.map((segment, index) =>
          segment.reference ? (
            <MentionHighlight key={index} reference={segment.reference}>
              {segment.text}
            </MentionHighlight>
          ) : (
            <React.Fragment key={index}>{segment.text}</React.Fragment>
          ),
        )}
      </div>
    </div>
  );
}

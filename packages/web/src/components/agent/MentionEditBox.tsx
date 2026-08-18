"use client";

import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/lib/general-utils";
import type { MessageReference, MessageReferenceType } from "@superglue/shared";
import React, { useLayoutEffect, useRef, useState } from "react";
import {
  mentionItemToReference,
  useMentionInput,
  type MentionItem,
} from "./hooks/use-mention-input";
import { MentionOverlay, MentionPopover } from "./MentionPopover";
import { dedupeReferences, reconcileReferences } from "@/src/lib/agent/mentions";

// Must match the Textarea below exactly - the overlay is aligned through these classes.
const EDIT_TEXT_CLASSES = "min-h-[72px] max-h-[200px] text-[13px] px-3 py-2";

/**
 * The message edit box with full @-mention support: same popover, same chips, same
 * whole-token deletion as the main composer, driven by the shared useMentionInput hook.
 */
export function MentionEditBox({
  value,
  onChange,
  references,
  onReferencesChange,
  mentionItems,
  isLoadingMentions = false,
  mentionGroupHints,
  onMentionQueryChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  references: MessageReference[];
  onReferencesChange: (references: MessageReference[]) => void;
  mentionItems?: MentionItem[];
  isLoadingMentions?: boolean;
  mentionGroupHints?: Partial<Record<MessageReferenceType, string>>;
  onMentionQueryChange?: (query: string | null) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Transcript messages can sit anywhere in the viewport, so the popover opens toward
  // whichever screen edge leaves more room instead of always covering the text above.
  const [placement, setPlacement] = useState<"above" | "below">("above");

  // Text is the source of truth: deleting a token by hand drops its reference too.
  const handleTextChange = (next: string) => {
    onChange(next);
    if (references.length) onReferencesChange(reconcileReferences(next, references));
  };

  const {
    isMentionOpen,
    visibleGroups,
    highlightedIndex,
    mentionSegments,
    mirrorRef,
    syncMirrorScroll,
    syncMention,
    closeMention,
    applyMention,
    setActiveIndex,
    setGroupLevel,
    handleKeyDown,
  } = useMentionInput({
    value,
    onChange: handleTextChange,
    inputRef,
    mentionItems,
    isLoadingMentions,
    onMentionSelect: (item) =>
      onReferencesChange(dedupeReferences([...references, mentionItemToReference(item)])),
    onMentionQueryChange,
    references,
  });

  useLayoutEffect(() => {
    if (!isMentionOpen) return;
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    setPlacement(spaceBelow > spaceAbove ? "below" : "above");
  }, [isMentionOpen]);

  return (
    <div ref={wrapperRef} className="relative">
      {isMentionOpen && (
        <MentionPopover
          visibleGroups={visibleGroups}
          highlightedIndex={highlightedIndex}
          isLoading={isLoadingMentions}
          groupHints={mentionGroupHints}
          onSelect={applyMention}
          onHoverIndex={setActiveIndex}
          onToggleGroup={setGroupLevel}
          placement={placement}
          portalAnchor={wrapperRef}
        />
      )}
      {mentionSegments && (
        <MentionOverlay
          segments={mentionSegments}
          mirrorRef={mirrorRef}
          textClassName={EDIT_TEXT_CLASSES}
        />
      )}
      <Textarea
        ref={inputRef}
        value={value}
        onChange={(e) => {
          handleTextChange(e.target.value);
          syncMention(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          handleKeyDown(e);
        }}
        onSelect={(e) => syncMention(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={closeMention}
        onScroll={syncMirrorScroll}
        placeholder={placeholder}
        autoFocus
        className={cn(
          "relative resize-none bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/20 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm focus-visible:ring-0",
          EDIT_TEXT_CLASSES,
        )}
      />
    </div>
  );
}

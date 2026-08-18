"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageReference, MessageReferenceType } from "@superglue/shared";
import {
  findMentionQuery,
  findTokenAt,
  insertMention,
  splitByMentions,
  MENTION_TRIGGER,
  type MentionQuery,
  type MentionSegment,
} from "@/src/lib/agent/mentions";

// One selectable entry in the @-mention popover.
export interface MentionItem {
  type: MessageReferenceType;
  id: string;
  label: string;
  description?: string;
  // Overrides the label stored on the reference, e.g. a run chip that should read
  // "customer-sync · FAILED" rather than just the tool id.
  referenceLabel?: string;
  // Run outcome, used to colour the chip green or red.
  status?: string;
  // The entity's own icon (systems), preferred over the generic type icon.
  icon?: string;
}

/** One conversion from popover entry to stored reference, shared by all mention editors. */
export function mentionItemToReference(item: MentionItem): MessageReference {
  return {
    type: item.type,
    id: item.id,
    label: item.referenceLabel || item.label,
    status: item.status,
    icon: item.icon,
  };
}

// How many rows a group shows per expansion step. Beyond the last step everything is shown,
// so a long list opens in stages instead of flooding the popover in one jump.
const GROUP_STEP_SIZES = [3, 15];
// Same order as the popover groups, so the flat keyboard index matches what is on screen.
const MENTION_TYPE_ORDER: MessageReferenceType[] = ["tool", "system", "run"];

/** Filters and orders the candidates of a single type. No cap - the group collapses instead. */
function rankWithinType(items: MentionItem[], needle: string): MentionItem[] {
  const matches = needle
    ? items.filter((item) =>
        [item.id, item.label, item.description].some((field) =>
          field?.toLowerCase().includes(needle),
        ),
      )
    : items;

  if (!needle) return matches;

  // Prefix matches first - typing "cust" should surface "customer-sync" before an entity
  // that only mentions "customer" somewhere in its description.
  return [...matches].sort((a, b) => {
    const aPrefix =
      a.id.toLowerCase().startsWith(needle) || a.label.toLowerCase().startsWith(needle);
    const bPrefix =
      b.id.toLowerCase().startsWith(needle) || b.label.toLowerCase().startsWith(needle);
    if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
    return 0;
  });
}

export interface MentionGroup {
  type: MessageReferenceType;
  matches: MentionItem[];
  level: number;
  entries: Array<{ item: MentionItem; index: number }>;
  hiddenCount: number;
}

export interface UseMentionInputOptions {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  mentionItems?: MentionItem[];
  isLoadingMentions?: boolean;
  onMentionSelect?: (item: MentionItem) => void;
  onMentionQueryChange?: (query: string | null) => void;
  references?: MessageReference[];
}

/**
 * All behavior of an @-mention capable textarea: trigger detection, ranked and staged
 * suggestion groups, keyboard navigation, whole-token deletion and the overlay segments.
 * Shared by the main composer and the message edit box so the two cannot drift apart.
 */
export function useMentionInput({
  value,
  onChange,
  inputRef,
  mentionItems,
  isLoadingMentions = false,
  onMentionSelect,
  onMentionQueryChange,
  references,
}: UseMentionInputOptions) {
  const mentionsEnabled = !!mentionItems;
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Expansion level per type: 0 shows GROUP_STEP_SIZES[0], the last level shows everything.
  const [expandLevels, setExpandLevels] = useState<Partial<Record<MessageReferenceType, number>>>(
    {},
  );

  const rankedGroups = useMemo(() => {
    if (!mention || !mentionItems) return [];
    const needle = mention.query.toLowerCase();
    return MENTION_TYPE_ORDER.map((type) => ({
      type,
      matches: rankWithinType(
        mentionItems.filter((item) => item.type === type),
        needle,
      ),
    })).filter((group) => group.matches.length > 0);
  }, [mention, mentionItems]);

  // Assigns every visible row a flat index so one arrow-key sequence walks all groups.
  const visibleGroups = useMemo<MentionGroup[]>(() => {
    let cursor = 0;
    return rankedGroups.map((group) => {
      const level = expandLevels[group.type] ?? 0;
      const limit =
        level < GROUP_STEP_SIZES.length ? GROUP_STEP_SIZES[level] : group.matches.length;
      const visible = group.matches.slice(0, limit);
      const entries = visible.map((item, offset) => ({ item, index: cursor + offset }));
      cursor += visible.length;
      return {
        ...group,
        level,
        entries,
        hiddenCount: group.matches.length - visible.length,
      };
    });
  }, [rankedGroups, expandLevels]);

  const suggestions = useMemo(
    () => visibleGroups.flatMap((group) => group.entries.map((entry) => entry.item)),
    [visibleGroups],
  );
  // Open whenever an @-query is active - an empty result shows a "no matches" row
  // instead of silently closing, so the user knows the search ran and found nothing.
  const isMentionOpen = !!mention;
  // Keeps the highlight valid while the list shrinks as the user keeps typing.
  const highlightedIndex = suggestions.length ? Math.min(activeIndex, suggestions.length - 1) : 0;

  const setGroupLevel = useCallback((type: MessageReferenceType, level: number) => {
    setExpandLevels((prev) => ({ ...prev, [type]: level }));
  }, []);

  // Caret positions have to be applied after React commits the new value, otherwise the
  // re-render moves the caret back to the end of the text.
  const pendingCaretRef = useRef<number | null>(null);
  useEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [value, inputRef]);

  // The overlay is a separate element, so it has to follow the textarea when it scrolls.
  const mirrorRef = useRef<HTMLDivElement>(null);
  const syncMirrorScroll = useCallback(() => {
    const el = inputRef.current;
    const mirror = mirrorRef.current;
    if (el && mirror) mirror.style.transform = `translateY(${-el.scrollTop}px)`;
  }, [inputRef]);

  const mentionSegments = useMemo<MentionSegment[] | null>(
    () => (references?.length ? splitByMentions(value, references) : null),
    [value, references],
  );

  // Tracks which query the highlight belongs to, so re-syncing on caret moves does not
  // reset the arrow-key selection the user just made.
  const mentionKeyRef = useRef<string | null>(null);

  const closeMention = useCallback(() => {
    mentionKeyRef.current = null;
    setMention(null);
    setActiveIndex(0);
    setExpandLevels({});
    onMentionQueryChange?.(null);
  }, [onMentionQueryChange]);

  const syncMention = useCallback(
    (text: string, caret: number | null) => {
      if (!mentionsEnabled || caret === null) {
        closeMention();
        return;
      }
      const next = findMentionQuery(text, caret);
      const key = next ? `${next.start}:${next.query}` : null;
      if (key !== mentionKeyRef.current) {
        mentionKeyRef.current = key;
        setActiveIndex(0);
        setExpandLevels({});
      }
      setMention(next);
      onMentionQueryChange?.(next ? next.query : null);
    },
    [mentionsEnabled, closeMention, onMentionQueryChange],
  );

  const applyMention = useCallback(
    (item: MentionItem) => {
      if (!mention) return;
      const caret = inputRef.current?.selectionStart ?? value.length;
      const result = insertMention(value, mention.start, caret, mentionItemToReference(item));
      pendingCaretRef.current = result.caret;
      onChange(result.text);
      onMentionSelect?.(item);
      closeMention();
    },
    [mention, value, onChange, onMentionSelect, closeMention, inputRef],
  );

  // A mention is one unit: editing a character inside it would silently break the link to
  // the entity, so a single Backspace or Delete removes the whole token. The trigger stays
  // behind so the popover reopens and the user can pick a different entity right away.
  const handleMentionDeletion = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return false;
      if (!references?.length) return false;

      const el = inputRef.current;
      if (!el || el.selectionStart === null || el.selectionStart !== el.selectionEnd) return false;

      const caret = el.selectionStart;
      const target = e.key === "Backspace" ? caret - 1 : caret;
      const hit = findTokenAt(value, references, target);
      if (!hit) return false;

      e.preventDefault();
      const nextText = value.slice(0, hit.start) + MENTION_TRIGGER + value.slice(hit.end);
      const nextCaret = hit.start + MENTION_TRIGGER.length;
      pendingCaretRef.current = nextCaret;
      onChange(nextText);
      syncMention(nextText, nextCaret);
      return true;
    },
    [references, inputRef, value, onChange, syncMention],
  );

  /** Returns true when the event was consumed (deletion or popover navigation). */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (handleMentionDeletion(e)) return true;

      if (!isMentionOpen) return false;
      // While the popover is open it owns the arrow keys, Enter, Tab and Escape.
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex(suggestions.length ? (highlightedIndex + 1) % suggestions.length : 0);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          suggestions.length ? (highlightedIndex - 1 + suggestions.length) % suggestions.length : 0,
        );
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const item = suggestions[highlightedIndex];
        if (item) {
          e.preventDefault();
          applyMention(item);
          return true;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMention();
        return true;
      }
      return false;
    },
    [
      handleMentionDeletion,
      isMentionOpen,
      suggestions,
      highlightedIndex,
      applyMention,
      closeMention,
    ],
  );

  return {
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
  };
}

import { MessageReference } from "@superglue/shared";

// Prefix that opens the mention popover in the composer.
export const MENTION_TRIGGER = "@";

// Runs are identified by UUIDs, which would make an unreadable token. They get a short,
// prefixed form instead; tools and systems already have human-readable slug ids.
const RUN_TOKEN_PREFIX = "run:";
const RUN_ID_SHORT_LENGTH = 8;

export interface MentionQuery {
  // Index of the "@" character in the text.
  start: number;
  // Everything typed between "@" and the caret.
  query: string;
}

/**
 * The text written into the composer for a reference, without the leading "@".
 *
 * Tools keep their id because that is what users call them by. Systems use their display
 * name so the composer matches the chip shown after sending. Runs get a shortened id -
 * their UUIDs would be unreadable.
 */
export function mentionToken(reference: MessageReference): string {
  if (reference.type === "run") {
    return `${RUN_TOKEN_PREFIX}${reference.id.slice(0, RUN_ID_SHORT_LENGTH)}`;
  }
  if (reference.type === "system") return reference.label || reference.id;
  return reference.id;
}

/** The full token including the trigger, e.g. "@customer-sync" or "@run:4d19f789". */
export function mentionTokenText(reference: MessageReference): string {
  return `${MENTION_TRIGGER}${mentionToken(reference)}`;
}

/**
 * Detects whether the caret currently sits inside an unfinished "@..." token.
 *
 * A mention only starts at the beginning of the text or after whitespace, so email
 * addresses and similar inline "@" usages do not open the popover.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 0 || caret > text.length) return null;

  const before = text.slice(0, caret);
  const start = before.lastIndexOf(MENTION_TRIGGER);
  if (start === -1) return null;

  const charBefore = start === 0 ? "" : before[start - 1];
  if (charBefore && !/\s/.test(charBefore)) return null;

  const query = before.slice(start + MENTION_TRIGGER.length);
  // Mention tokens are single words - a space means the user moved on.
  if (/\s/.test(query)) return null;

  return { start, query };
}

/**
 * Replaces the in-progress "@..." token with the final mention token and returns the
 * new text plus the caret position the composer should restore.
 */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  reference: MessageReference,
): { text: string; caret: number } {
  const token = `${mentionTokenText(reference)} `;
  const next = text.slice(0, start) + token + text.slice(caret);
  return { text: next, caret: start + token.length };
}

/**
 * Drops references whose token no longer appears in the text, so deleting "@customer-sync"
 * by hand also removes the structured reference instead of silently keeping it.
 */
export function reconcileReferences(
  text: string,
  references: MessageReference[],
): MessageReference[] {
  return references.filter((reference) => text.includes(mentionTokenText(reference)));
}

/** Removes duplicates so mentioning the same entity twice only resolves it once. */
export function dedupeReferences(references: MessageReference[]): MessageReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.type}:${reference.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface MentionSegment {
  text: string;
  reference?: MessageReference;
}

/**
 * Splits text into plain runs and mention tokens so both the composer overlay and the
 * transcript can render mentions as chips instead of raw text.
 */
export function splitByMentions(text: string, references: MessageReference[]): MentionSegment[] {
  if (references.length === 0) return text ? [{ text }] : [];

  // Longest token first so one token can never shadow another that starts with it.
  const tokens = references
    .map((reference) => ({ reference, token: mentionTokenText(reference) }))
    .sort((a, b) => b.token.length - a.token.length);

  const segments: MentionSegment[] = [];
  let cursor = 0;
  let plainStart = 0;

  while (cursor < text.length) {
    const hit = tokens.find((entry) => text.startsWith(entry.token, cursor));
    if (!hit) {
      cursor += 1;
      continue;
    }
    if (cursor > plainStart) segments.push({ text: text.slice(plainStart, cursor) });
    segments.push({ text: hit.token, reference: hit.reference });
    cursor += hit.token.length;
    plainStart = cursor;
  }

  if (plainStart < text.length) segments.push({ text: text.slice(plainStart) });
  return segments;
}

export interface MentionTokenMatch {
  start: number;
  end: number;
  reference: MessageReference;
}

/**
 * Finds the mention token covering a character index, used to make a single Backspace
 * remove the whole reference instead of leaving a broken half-token behind.
 */
export function findTokenAt(
  text: string,
  references: MessageReference[],
  index: number,
): MentionTokenMatch | null {
  if (index < 0 || index >= text.length) return null;

  for (const reference of references) {
    const token = mentionTokenText(reference);
    let from = text.indexOf(token);
    while (from !== -1) {
      const to = from + token.length;
      if (index >= from && index < to) return { start: from, end: to, reference };
      from = text.indexOf(token, from + 1);
    }
  }
  return null;
}

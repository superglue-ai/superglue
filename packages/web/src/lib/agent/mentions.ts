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

export interface MentionTokenMatch {
  start: number;
  end: number;
  reference: MessageReference;
}

// Characters that would continue a token word. A candidate occurrence followed by one of
// these is part of a longer word (e.g. "@sync" inside "@sync-orders") and does not count.
const TOKEN_CONTINUATION = /[A-Za-z0-9_-]/;

function hasTokenBoundaries(text: string, start: number, end: number): boolean {
  // Same rule as findMentionQuery: a token starts at the text start or after whitespace,
  // so "@customer-sync" inside "ops@customer-sync.io" is not a token.
  const before = start === 0 ? "" : text[start - 1];
  if (before && !/\s/.test(before)) return false;
  const after = end >= text.length ? "" : text[end];
  if (after && TOKEN_CONTINUATION.test(after)) return false;
  return true;
}

/**
 * The single source of truth for "where in this text are mention tokens". Longest tokens
 * claim their ranges first (so a token that is a prefix of another can never shadow it),
 * candidates need word boundaries on both sides, and claimed ranges never overlap.
 * Display, whole-token deletion and reference reconciliation all build on this scan,
 * which is what keeps the three from ever disagreeing about what counts as a token.
 */
export function scanMentionTokens(
  text: string,
  references: MessageReference[],
): MentionTokenMatch[] {
  if (!text || references.length === 0) return [];

  const entries = references
    .map((reference) => ({ reference, token: mentionTokenText(reference) }))
    .sort((a, b) => b.token.length - a.token.length);

  const matches: MentionTokenMatch[] = [];
  const overlapsClaimed = (start: number, end: number) =>
    matches.some((m) => start < m.end && m.start < end);

  for (const { reference, token } of entries) {
    let from = text.indexOf(token);
    while (from !== -1) {
      const to = from + token.length;
      if (hasTokenBoundaries(text, from, to) && !overlapsClaimed(from, to)) {
        matches.push({ start: from, end: to, reference });
      }
      from = text.indexOf(token, from + 1);
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Drops references whose token no longer appears in the text, so deleting "@customer-sync"
 * by hand also removes the structured reference instead of silently keeping it.
 */
export function reconcileReferences(
  text: string,
  references: MessageReference[],
): MessageReference[] {
  const present = new Set(
    scanMentionTokens(text, references).map((m) => `${m.reference.type}:${m.reference.id}`),
  );
  return references.filter((reference) => present.has(`${reference.type}:${reference.id}`));
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
  const matches = scanMentionTokens(text, references);
  if (matches.length === 0) return text ? [{ text }] : [];

  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start) });
    segments.push({ text: text.slice(match.start, match.end), reference: match.reference });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
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
  return scanMentionTokens(text, references).find((m) => index >= m.start && index < m.end) ?? null;
}

const MENTION_REFERENCE_TYPES = new Set(["tool", "system", "run"]);

/**
 * Validates reference objects coming from the client before they reach any code that
 * dereferences them. Malformed entries (null, wrong shape, unknown type) are dropped so a
 * bad request degrades to fewer references instead of crashing the whole agent call.
 */
export function sanitizeReferences(value: unknown): MessageReference[] {
  if (!Array.isArray(value)) return [];

  const sanitized: MessageReference[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { type, id, label, status, icon } = entry as Record<string, unknown>;
    if (typeof type !== "string" || !MENTION_REFERENCE_TYPES.has(type)) continue;
    if (typeof id !== "string" || id.length === 0) continue;
    sanitized.push({
      type: type as MessageReference["type"],
      id,
      label: typeof label === "string" && label.length > 0 ? label : id,
      status: typeof status === "string" ? status : undefined,
      icon: typeof icon === "string" ? icon : undefined,
    });
  }
  return sanitized;
}

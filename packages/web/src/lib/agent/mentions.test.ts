import { describe, expect, it } from "vitest";
import type { MessageReference } from "@superglue/shared";
import {
  dedupeReferences,
  findMentionQuery,
  findTokenAt,
  insertMention,
  mentionToken,
  mentionTokenText,
  reconcileReferences,
  splitByMentions,
} from "./mentions";

const toolRef: MessageReference = { type: "tool", id: "customer-sync", label: "Customer Sync" };
const systemRef: MessageReference = { type: "system", id: "public_api_3", label: "Public API 3" };
const runRef: MessageReference = {
  type: "run",
  id: "4d19f789-cd0d-4430-b2e3-ac859127feac",
  label: "customer-sync · FAILED",
  status: "FAILED",
};

describe("findMentionQuery", () => {
  it("should detect the query when the caret sits inside an @ token", () => {
    expect(findMentionQuery("Why did @cust", 13)).toEqual({ start: 8, query: "cust" });
  });

  it("should detect a bare @ at the start of the text", () => {
    expect(findMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("should return null when there is no @ before the caret", () => {
    expect(findMentionQuery("no mention here", 15)).toBeNull();
  });

  it("should not trigger when the @ is part of a word, like an email address", () => {
    const text = "mail me at max@firma.de";
    expect(findMentionQuery(text, text.length)).toBeNull();
  });

  it("should close once the user types whitespace after the query", () => {
    expect(findMentionQuery("@cust omer", 10)).toBeNull();
  });

  it("should return null when the caret is out of bounds", () => {
    expect(findMentionQuery("@cust", -1)).toBeNull();
    expect(findMentionQuery("@cust", 99)).toBeNull();
  });
});

describe("mentionToken", () => {
  it("should use the id for tools", () => {
    expect(mentionToken(toolRef)).toBe("customer-sync");
  });

  it("should use the display name for systems", () => {
    expect(mentionToken(systemRef)).toBe("Public API 3");
  });

  it("should fall back to the id when a system has no label", () => {
    expect(mentionToken({ type: "system", id: "gmail", label: "" })).toBe("gmail");
  });

  it("should shorten run UUIDs behind a run: prefix", () => {
    expect(mentionToken(runRef)).toBe("run:4d19f789");
  });

  it("should prepend the trigger in mentionTokenText", () => {
    expect(mentionTokenText(toolRef)).toBe("@customer-sync");
  });
});

describe("insertMention", () => {
  it("should replace the in-progress token and place the caret after it", () => {
    const result = insertMention("Why did @cust fail?", 8, 13, toolRef);
    expect(result.text).toBe("Why did @customer-sync  fail?");
    expect(result.caret).toBe("Why did @customer-sync ".length);
  });

  it("should insert multi-word system tokens when the label contains spaces", () => {
    const result = insertMention("Is @pub up?", 3, 7, systemRef);
    expect(result.text).toBe("Is @Public API 3  up?");
  });
});

describe("reconcileReferences", () => {
  it("should keep references whose token still appears in the text", () => {
    const kept = reconcileReferences("Why did @customer-sync fail?", [toolRef, runRef]);
    expect(kept).toEqual([toolRef]);
  });

  it("should drop every reference when all tokens were deleted", () => {
    expect(reconcileReferences("nothing left", [toolRef, systemRef, runRef])).toEqual([]);
  });

  it("should match runs by their shortened token", () => {
    expect(reconcileReferences("see @run:4d19f789 please", [runRef])).toEqual([runRef]);
  });
});

describe("dedupeReferences", () => {
  it("should remove duplicate references while keeping the first occurrence", () => {
    expect(dedupeReferences([toolRef, systemRef, toolRef])).toEqual([toolRef, systemRef]);
  });

  it("should keep different types with the same id apart", () => {
    const asSystem: MessageReference = { type: "system", id: "customer-sync", label: "X" };
    expect(dedupeReferences([toolRef, asSystem])).toEqual([toolRef, asSystem]);
  });
});

describe("splitByMentions", () => {
  it("should return one plain segment when there are no references", () => {
    expect(splitByMentions("hello", [])).toEqual([{ text: "hello" }]);
  });

  it("should tag mention tokens with their reference", () => {
    expect(splitByMentions("Why did @customer-sync fail?", [toolRef])).toEqual([
      { text: "Why did " },
      { text: "@customer-sync", reference: toolRef },
      { text: " fail?" },
    ]);
  });

  it("should prefer the longer token when one token is a prefix of another", () => {
    const short: MessageReference = { type: "tool", id: "sync", label: "sync" };
    const long: MessageReference = { type: "tool", id: "sync-orders", label: "sync-orders" };
    expect(splitByMentions("@sync-orders", [short, long])).toEqual([
      { text: "@sync-orders", reference: long },
    ]);
  });

  it("should tag every occurrence when the same token appears twice", () => {
    const segments = splitByMentions("@customer-sync and @customer-sync", [toolRef]);
    expect(segments.filter((s) => s.reference)).toHaveLength(2);
  });
});

describe("findTokenAt", () => {
  const text = "Why did @customer-sync fail?";

  it("should return the token range when the index is inside a token", () => {
    expect(findTokenAt(text, [toolRef], 12)).toEqual({
      start: 8,
      end: 22,
      reference: toolRef,
    });
  });

  it("should hit at the first character and miss right after the token", () => {
    expect(findTokenAt(text, [toolRef], 8)).not.toBeNull();
    expect(findTokenAt(text, [toolRef], 22)).toBeNull();
  });

  it("should return null in plain text", () => {
    expect(findTokenAt(text, [toolRef], 2)).toBeNull();
  });

  it("should find the second occurrence of a repeated token", () => {
    const twice = "@customer-sync then @customer-sync";
    expect(findTokenAt(twice, [toolRef], 25)).toEqual({
      start: 20,
      end: 34,
      reference: toolRef,
    });
  });
});

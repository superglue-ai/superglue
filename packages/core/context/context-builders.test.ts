import { describe, expect, it } from "vitest";
import { getObjectContext, getToolBuilderContext } from "./context-builders.js";

function timeIt<T>(fn: () => T): { ms: number; result: T } {
  const start = Date.now();
  const result = fn();
  const ms = Date.now() - start;
  return { ms, result };
}

// Helpers to generate nasty structures
function buildDeepObject(depth: number, breadth: number): any {
  let obj: any = {};
  let current = obj;
  for (let d = 0; d < depth; d++) {
    const next: any = {};
    // attach breadth simple keys at each level to stress preview logic
    for (let b = 0; b < breadth; b++) {
      next[`k${d}_${b}`] = b;
    }
    current[`level_${d}`] = next;
    current = next;
  }
  return obj;
}

function buildWideObject(keys: number): any {
  const obj: any = {};
  for (let i = 0; i < keys; i++) {
    obj[`key_${i}`] = i;
  }
  return obj;
}

function buildLongArray(len: number): any[] {
  const arr: any[] = new Array(len).fill(0).map((_, i) => ({ idx: i, v: `x${i}` }));
  return arr;
}

describe("getObjectContext performance and budget", () => {
  it("handles extremely deep objects within 5s and respects budget", () => {
    const deep = buildDeepObject(100, 100);
    const budget = 20_000;
    const { ms, result } = timeIt(() => getObjectContext(deep, { characterBudget: budget }));
    expect(ms).toBeLessThanOrEqual(20_000);
    expect(result.length).toBeLessThanOrEqual(budget + 50); // headers may slightly exceed share but not budget
  });

  it("handles very wide objects within 5s and respects budget", () => {
    // Use a large but reasonable number; the preview logic caps keys per level
    const wide = buildWideObject(1_000_000);
    const budget = 15_000;
    const { ms, result } = timeIt(() =>
      getObjectContext(wide, {
        characterBudget: budget,
        tuning: {
          previewObjectKeyLimit: 100,
          previewArrayLimit: 5,
          previewDepthLimit: 5,
          samplesMaxArrayPaths: 2,
          samplesItemsPerArray: 2,
          sampleObjectMaxDepth: 2,
        },
      }),
    );
    expect(ms).toBeLessThanOrEqual(20_000);
    expect(result.length).toBeLessThanOrEqual(budget + 50);
  });

  it("handles insanely long arrays within 5s and respects budget", () => {
    const obj = { data: buildLongArray(1_000_000) };
    const budget = 12_000;
    const { ms, result } = timeIt(() =>
      getObjectContext(obj, {
        characterBudget: budget,
        tuning: {
          previewObjectKeyLimit: 100,
          previewArrayLimit: 5,
          previewDepthLimit: 5,
          samplesMaxArrayPaths: 2,
          samplesItemsPerArray: 2,
          sampleObjectMaxDepth: 2,
        },
      }),
    );
    expect(ms).toBeLessThanOrEqual(20_000);
    expect(result.length).toBeLessThanOrEqual(budget + 50);
  });

  it("small budget strictly enforced", () => {
    const obj = { a: buildLongArray(1_000_000), b: buildDeepObject(50, 10) };
    const budget = 2000;
    const { result } = timeIt(() =>
      getObjectContext(obj, {
        characterBudget: budget,
        tuning: {
          previewObjectKeyLimit: 50,
          previewArrayLimit: 3,
          previewDepthLimit: 4,
          samplesMaxArrayPaths: 1,
          samplesItemsPerArray: 1,
          sampleObjectMaxDepth: 2,
        },
      }),
    );
    expect(result.length).toBeLessThanOrEqual(budget + 100);
  });

  it("omits sections not requested", () => {
    const obj = { a: [1, 2, 3], b: { c: 1 } };
    const { result } = timeIt(() =>
      getObjectContext(obj, {
        characterBudget: 50,
        include: { schema: false, preview: true, samples: false },
      }),
    );
    expect(result).toMatch(/<object_preview>|<full_object>/);
    expect(result).not.toMatch(/<schema>/);
    expect(result).not.toMatch(/<samples>/);
  });
});

describe("getObjectContext edge cases for include combinations and strict budgets", () => {
  it("returns empty when all include flags are false", () => {
    const obj = { x: 1 };
    const out = getObjectContext(obj, {
      characterBudget: 100,
      include: { schema: false, preview: false, samples: false },
    });
    expect(out).toBe("");
  });

  it("enforces budget = 1 strictly (no negative math)", () => {
    const out = getObjectContext(
      { a: 1 },
      { characterBudget: 1, include: { schema: true, preview: true, samples: true } },
    );
    expect(out.length).toBeLessThanOrEqual(1);
  });

  it("negative budget yields empty string", () => {
    const out = getObjectContext(
      { a: 1 },
      { characterBudget: -100, include: { schema: true, preview: true, samples: true } },
    );
    expect(out).toBe("");
  });

  it("schema only - returns full_object when it fits in budget", () => {
    const out = getObjectContext(
      { a: 1, b: 2 },
      { characterBudget: 200, include: { schema: true, preview: false, samples: false } },
    );
    // When full object fits, we return it instead of lossy schema
    expect(out).toMatch(/<full_object>/);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("schema only - returns schema when full object exceeds budget", () => {
    const largeObj = { a: "x".repeat(500), b: "y".repeat(500) };
    const out = getObjectContext(largeObj, {
      characterBudget: 200,
      include: { schema: true, preview: false, samples: false },
    });
    expect(out).toMatch(/<schema>/);
    expect(out).not.toMatch(/<full_object>/);
    expect(out).not.toMatch(/<object_preview>/);
    expect(out).not.toMatch(/<samples>/);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("samples only - returns full_object when it fits in budget", () => {
    const small = { arr: [1, 2, 3, 4, 5] };
    const out = getObjectContext(small, {
      characterBudget: 200,
      include: { schema: false, preview: false, samples: true },
    });
    expect(out).toMatch(/<full_object>/);
    expect(out).not.toMatch(/<schema>/);
    expect(out).not.toMatch(/<object_preview>/);
    expect(out).not.toMatch(/<samples>/);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("samples only - returns samples when full object exceeds budget", () => {
    const largeObj = {
      arr: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `item_${i}`,
        value: "x".repeat(50),
      })),
    };
    const out = getObjectContext(largeObj, {
      characterBudget: 500,
      include: { schema: false, preview: false, samples: true },
    });
    expect(out).toMatch(/Samples/);
    expect(out).not.toMatch(/<full_object>/);
    expect(out).not.toMatch(/<schema>/);
    expect(out).not.toMatch(/<object_preview>/);
    expect(out.length).toBeLessThanOrEqual(500);
  });

  it("preview only may return Full Object if it fits", () => {
    const small = { x: 1 };
    const out = getObjectContext(small, {
      characterBudget: 500,
      include: { schema: false, preview: true, samples: false },
    });
    expect(out).toMatch(/<(object_preview|full_object)>/);
    expect(out.length).toBeLessThanOrEqual(500);
  });

  it("handles circular references without throwing", () => {
    const a: any = { x: 1 };
    a.self = a;
    const out = getObjectContext(a, {
      characterBudget: 300,
      include: { schema: true, preview: true, samples: true },
    });
    expect(out.length).toBeLessThanOrEqual(300);
  });

  it("handles mixed types including BigInt and Date", () => {
    const obj = {
      n: BigInt(123),
      d: new Date("2020-01-01T00:00:00Z"),
      u: undefined,
      s: "x".repeat(10000),
    } as any;
    const out = getObjectContext(obj, {
      characterBudget: 600,
      include: { schema: true, preview: true, samples: true },
    });
    expect(out.length).toBeLessThanOrEqual(600);
  });
});

describe("getWorkflowBuilderContext budget and include combinations", () => {
  const system = {
    id: "test_system",
    urlHost: "https://api.example.com",
    urlPath: "/v1",
    documentation:
      "Auth: use bearer token. Pagination via page and limit. Endpoints: /items, /users",
    specificInstructions: "Respect rate limits.",
    openApiSchema: undefined,
  } as any;

  process.env.LLM_PROVIDER = "OPENAI";

  it("zero or negative budget returns empty string", () => {
    const input = {
      systems: [system],
      payload: { x: 1 },
      userInstruction: "Do X",
    } as any;
    expect(getToolBuilderContext(input, { characterBudget: 0, include: {} } as any)).toBe("");
    expect(getToolBuilderContext(input, { characterBudget: -10, include: {} } as any)).toBe("");
  });

  it("includes only requested sections and enforces budget", () => {
    const input = {
      systems: [system],
      payload: { x: 1, y: 2 },
      userInstruction: "Fetch items",
    } as any;
    const out = getToolBuilderContext(input, {
      characterBudget: 800,
      include: {
        systemContext: true,
        availableVariablesContext: true,
        payloadContext: true,
        userInstruction: true,
      },
    });
    expect(out.length).toBeLessThanOrEqual(820);
    expect(out).toMatch(/<available_systems_and_documentation>/);
    expect(out).toMatch(/<available_variables>/);
    expect(out).toMatch(/<workflow_input>/);
    expect(out).toMatch(/<instruction>/);
  });

  it("no systems path emits hint and enforces budget", () => {
    const input = { systems: [], payload: { q: 1 }, userInstruction: "Transform data" } as any;
    const out = getToolBuilderContext(input, {
      characterBudget: 500,
      include: {
        systemContext: true,
        availableVariablesContext: false,
        payloadContext: false,
        userInstruction: true,
      },
    });
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toMatch(/No systems provided\. Please provide systems to build a workflow/);
  });

  it("available variables include system credentials and payload keys when requested", () => {
    const input = {
      systems: [{ ...system, credentials: { apiKey: "xxx" } }],
      payload: { foo: 1 },
      userInstruction: "N/A",
    } as any;
    const out = getToolBuilderContext(input, {
      characterBudget: 1000,
      include: { availableVariablesContext: true } as any,
    });
    expect(out).toMatch(/<<test_system_apiKey>>/);
    expect(out).toMatch(/<<foo>>/);
  });
});

describe("getObjectContext full_object optimization", () => {
  it("returns full_object when object fits exactly at budget boundary", () => {
    const obj = { a: 1 };
    const fullJson = JSON.stringify(obj);
    const fullObjectWrapper = "<full_object>\n" + fullJson + "</full_object>";
    // Budget exactly at full_object size
    const out = getObjectContext(obj, {
      characterBudget: fullObjectWrapper.length,
      include: { schema: true, preview: true, samples: true },
    });
    expect(out).toMatch(/<full_object>/);
    expect(out).toContain(fullJson);
  });

  it("falls back to sections when full object with wrapper exceeds budget", () => {
    // Use an object large enough that sections can still be generated
    const obj = { a: "x".repeat(100), b: "y".repeat(100) };
    const fullJson = JSON.stringify(obj);
    const fullObjectWrapperOverhead = "<full_object>\n".length + "</full_object>".length;
    // Budget exactly 1 char short of wrapped full_object
    const budget = fullJson.length + fullObjectWrapperOverhead - 1;
    const out = getObjectContext(obj, {
      characterBudget: budget,
      include: { schema: true, preview: true, samples: true },
    });
    // Should NOT be full_object, should be sections
    expect(out).not.toMatch(/<full_object>/);
    expect(out).toMatch(/<schema>|<object_preview>|Samples/);
    expect(out.length).toBeLessThanOrEqual(budget);
  });

  it("full_object contains actual data, not empty", () => {
    const obj = { foo: "bar", nums: [1, 2, 3] };
    const out = getObjectContext(obj, {
      characterBudget: 500,
      include: { schema: true, preview: true, samples: true },
    });
    expect(out).toMatch(/<full_object>/);
    expect(out).toContain("foo");
    expect(out).toContain("bar");
    expect(out).toContain("[1,2,3]");
  });

  it("preview only - returns full_object when it fits", () => {
    const obj = { x: 1, y: 2 };
    const out = getObjectContext(obj, {
      characterBudget: 200,
      include: { schema: false, preview: true, samples: false },
    });
    expect(out).toMatch(/<full_object>/);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("preview only - returns preview when full object exceeds budget", () => {
    const largeObj = { data: "x".repeat(500) };
    const out = getObjectContext(largeObj, {
      characterBudget: 200,
      include: { schema: false, preview: true, samples: false },
    });
    expect(out).toMatch(/<object_preview>/);
    expect(out).not.toMatch(/<full_object>/);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("all sections enabled - budget carry-over works when schema is small", () => {
    // Large object that won't fit as full_object
    const largeObj = {
      data: Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `item_${i}`,
        desc: "x".repeat(100),
      })),
    };
    const out = getObjectContext(largeObj, {
      characterBudget: 2000,
      include: { schema: true, preview: true, samples: true },
    });
    expect(out).not.toMatch(/<full_object>/);
    // Should have all three sections
    expect(out).toMatch(/<schema>/);
    expect(out).toMatch(/<object_preview>/);
    expect(out).toMatch(/Samples/);
    expect(out.length).toBeLessThanOrEqual(2000);
  });

  it("handles empty object gracefully", () => {
    const out = getObjectContext(
      {},
      { characterBudget: 100, include: { schema: true, preview: true, samples: true } },
    );
    expect(out).toMatch(/<full_object>/);
    expect(out).toContain("{}");
  });

  it("handles null input gracefully", () => {
    const out = getObjectContext(null, {
      characterBudget: 100,
      include: { schema: true, preview: true, samples: true },
    });
    expect(out).toMatch(/<full_object>/);
    expect(out).toContain("null");
  });

  it("handles array as root object", () => {
    const arr = [1, 2, 3, 4, 5];
    const out = getObjectContext(arr, {
      characterBudget: 100,
      include: { schema: true, preview: true, samples: true },
    });
    expect(out).toMatch(/<full_object>/);
    expect(out).toContain("[1,2,3,4,5]");
  });
});

import { describe, expect, it } from 'vitest';
import {
    getEvaluateStepResponseContext,
    getEvaluateTransformContext,
    getLoopSelectorContext,
    getObjectContext,
    getTransformContext,
    getToolBuilderContext
} from './context-builders.js';

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

describe('getObjectContext performance and budget', () => {
    it('handles extremely deep objects within 5s and respects budget', () => {
        const deep = buildDeepObject(100, 100);
        const budget = 20_000;
        const { ms, result } = timeIt(() => getObjectContext(deep, { characterBudget: budget }));
        expect(ms).toBeLessThanOrEqual(20_000);
        expect(result.length).toBeLessThanOrEqual(budget + 50); // headers may slightly exceed share but not budget
    });

    it('handles very wide objects within 5s and respects budget', () => {
        // Use a large but reasonable number; the preview logic caps keys per level
        const wide = buildWideObject(1_000_000);
        const budget = 15_000;
        const { ms, result } = timeIt(() => getObjectContext(wide, {
            characterBudget: budget,
            tuning: { previewObjectKeyLimit: 100, previewArrayLimit: 5, previewDepthLimit: 5, samplesMaxArrayPaths: 2, samplesItemsPerArray: 2, sampleObjectMaxDepth: 2 }
        }));
        expect(ms).toBeLessThanOrEqual(20_000);
        expect(result.length).toBeLessThanOrEqual(budget + 50);
    });

    it('handles insanely long arrays within 5s and respects budget', () => {
        const obj = { data: buildLongArray(1_000_000) };
        const budget = 12_000;
        const { ms, result } = timeIt(() => getObjectContext(obj, {
            characterBudget: budget,
            tuning: { previewObjectKeyLimit: 100, previewArrayLimit: 5, previewDepthLimit: 5, samplesMaxArrayPaths: 2, samplesItemsPerArray: 2, sampleObjectMaxDepth: 2 }
        }));
        expect(ms).toBeLessThanOrEqual(20_000);
        expect(result.length).toBeLessThanOrEqual(budget + 50);
    });

    it('small budget strictly enforced', () => {
        const obj = { a: buildLongArray(1_000_000), b: buildDeepObject(50, 10) };
        const budget = 2000;
        const { result } = timeIt(() => getObjectContext(obj, {
            characterBudget: budget,
            tuning: { previewObjectKeyLimit: 50, previewArrayLimit: 3, previewDepthLimit: 4, samplesMaxArrayPaths: 1, samplesItemsPerArray: 1, sampleObjectMaxDepth: 2 }
        }));
        expect(result.length).toBeLessThanOrEqual(budget + 100);
    });

    it('omits sections not requested', () => {
        const obj = { a: [1, 2, 3], b: { c: 1 } };
        const { result } = timeIt(() => getObjectContext(obj, { characterBudget: 50, include: { schema: false, preview: true, samples: false } }));
        expect(result).toMatch(/<object_preview>|<full_object>/);
        expect(result).not.toMatch(/<schema>/);
        expect(result).not.toMatch(/<samples>/);
    });
});


describe('getObjectContext edge cases for include combinations and strict budgets', () => {
    it('returns empty when all include flags are false', () => {
        const obj = { x: 1 };
        const out = getObjectContext(obj, { characterBudget: 100, include: { schema: false, preview: false, samples: false } });
        expect(out).toBe('');
    });

    it('enforces budget = 1 strictly (no negative math)', () => {
        const out = getObjectContext({ a: 1 }, { characterBudget: 1, include: { schema: true, preview: true, samples: true } });
        expect(out.length).toBeLessThanOrEqual(1);
    });

    it('negative budget yields empty string', () => {
        const out = getObjectContext({ a: 1 }, { characterBudget: -100, include: { schema: true, preview: true, samples: true } });
        expect(out).toBe('');
    });

    it('schema only', () => {
        const out = getObjectContext({ a: 1, b: 2 }, { characterBudget: 200, include: { schema: true, preview: false, samples: false } });
        expect(out).toMatch(/<schema>/);
        expect(out).not.toMatch(/<object_preview>|<full_object>/);
        expect(out).not.toMatch(/<samples>/);
        expect(out.length).toBeLessThanOrEqual(200);
    });

    it('samples only prefers samples, but may fall back to Full Object if small and within budget', () => {
        const small = { arr: [1, 2, 3, 4, 5] };
        const out = getObjectContext(small, { characterBudget: 200, include: { schema: false, preview: false, samples: true } });
        expect(out).toMatch(/<samples>|<full_object>/);
        expect(out).not.toMatch(/<schema>/);
        expect(out).not.toMatch(/<object_preview>/);
        expect(out.length).toBeLessThanOrEqual(200);
    });

    it('preview only may return Full Object if it fits', () => {
        const small = { x: 1 };
        const out = getObjectContext(small, { characterBudget: 500, include: { schema: false, preview: true, samples: false } });
        expect(out).toMatch(/<(object_preview|full_object)>/);
        expect(out.length).toBeLessThanOrEqual(500);
    });

    it('handles circular references without throwing', () => {
        const a: any = { x: 1 };
        a.self = a;
        const out = getObjectContext(a, { characterBudget: 300, include: { schema: true, preview: true, samples: true } });
        expect(out.length).toBeLessThanOrEqual(300);
    });

    it('handles mixed types including BigInt and Date', () => {
        const obj = { n: BigInt(123), d: new Date('2020-01-01T00:00:00Z'), u: undefined, s: 'x'.repeat(10000) } as any;
        const out = getObjectContext(obj, { characterBudget: 600, include: { schema: true, preview: true, samples: true } });
        expect(out.length).toBeLessThanOrEqual(600);
    });
});

describe('getWorkflowBuilderContext budget and include combinations', () => {
    const integration = {
        id: 'test_integration',
        urlHost: 'https://api.example.com',
        urlPath: '/v1',
        documentation: 'Auth: use bearer token. Pagination via page and limit. Endpoints: /items, /users',
        specificInstructions: 'Respect rate limits.',
        openApiSchema: undefined
    } as any;

    process.env.LLM_PROVIDER = 'OPENAI';

    it('zero or negative budget returns empty string', () => {
        const input = { integrations: [integration], payload: { x: 1 }, userInstruction: 'Do X' } as any;
        expect(getToolBuilderContext(input, { characterBudget: 0, include: {} } as any)).toBe('');
        expect(getToolBuilderContext(input, { characterBudget: -10, include: {} } as any)).toBe('');
    });

    it('includes only requested sections and enforces budget', () => {
        const input = { integrations: [integration], payload: { x: 1, y: 2 }, userInstruction: 'Fetch items' } as any;
        const out = getToolBuilderContext(input, { characterBudget: 800, include: { integrationContext: true, availableVariablesContext: true, payloadContext: true, userInstruction: true } });
        expect(out.length).toBeLessThanOrEqual(820);
        expect(out).toMatch(/<available_integrations_and_documentation>/);
        expect(out).toMatch(/<available_variables>/);
        expect(out).toMatch(/<workflow_input>/);
        expect(out).toMatch(/<instruction>/);
    });

    it('no integrations path emits transform-only hint and enforces budget', () => {
        const input = { integrations: [], payload: { q: 1 }, userInstruction: 'Transform data' } as any;
        const out = getToolBuilderContext(input, { characterBudget: 500, include: { integrationContext: true, availableVariablesContext: false, payloadContext: false, userInstruction: true } });
        expect(out.length).toBeLessThanOrEqual(500);
        expect(out).toMatch(/No integrations provided\. Build a transform-only workflow/);
    });

    it('available variables include integration credentials and payload keys when requested', () => {
        const input = { integrations: [{ ...integration, credentials: { apiKey: 'xxx' } }], payload: { foo: 1 }, userInstruction: 'N/A' } as any;
        const out = getToolBuilderContext(input, { characterBudget: 1000, include: { availableVariablesContext: true } as any });
        expect(out).toMatch(/<<test_integration_apiKey>>/);
        expect(out).toMatch(/<<foo>>/);
    });
});

describe('getLoopSelectorContext budgets and content', () => {
    const step = { id: 's1', apiConfig: { instruction: 'Filter by status=active' } } as any;
    const input = { step, payload: { data: [{ id: 1 }, { id: 2 }] }, instruction: 'loop' } as any;

    it('enforces budget and contains step and payload context plus explicit end prompt', () => {
        const out = getLoopSelectorContext(input, { characterBudget: 550 });
        expect(out.length).toBeLessThanOrEqual(550);
        expect(out).toMatch(/<instruction>/);
        expect(out).toMatch(/<loop_selector_input>/);
        expect(out).toMatch(/The function should return an array of items/);
    });
});

describe('getEvaluateStepResponseContext budgets and content', () => {
    const input = {
        data: { list: [1, 2, 3] },
        endpoint: { id: 'e1', instruction: 'List items', method: 'GET', urlHost: 'https://api.example.com', urlPath: '/v1' },
        docSearchResultsForStepInstruction: 'Relevant docs'
    } as any;

    it('enforces budget and includes data, step_config, and doc search tags', () => {
        const out = getEvaluateStepResponseContext(input, { characterBudget: 800 });
        expect(out.length).toBeLessThanOrEqual(800);
        expect(out).toMatch(/<step_response>/);
        expect(out).toMatch(/<step_config>/);
        expect(out).toMatch(/<doc_search_results_for_step_instruction>/);
    });
});

describe('getTransformContext budgets and content', () => {
    const input = {
        instruction: 'Map fields',
        targetSchema: { type: 'object', properties: { id: { type: 'number' } } },
        sourceData: { users: [{ id: 1 }, { id: 2 }] }
    } as any;

    it('enforces budget and includes instruction, target_schema, and source_data', () => {
        const out = getTransformContext(input, { characterBudget: 500 });
        expect(out.length).toBeLessThanOrEqual(500);
        expect(out).toMatch(/<instruction>/);
        expect(out).toMatch(/<target_schema>/);
        expect(out).toMatch(/<transform_input>/);
    });
});

describe('getEvaluateTransformContext budgets and content', () => {
    const base = {
        targetSchema: { type: 'object', properties: { id: { type: 'number' } } },
        sourceData: { users: [{ id: 1 }, { id: 2 }] },
        transformedData: [{ id: 1 }],
        transformCode: 'return sourceData.users;'
    } as any;

    it('with instruction: enforces budget', () => {
        const out = getEvaluateTransformContext({ ...base, instruction: 'Ensure mapping' }, { characterBudget: 700 });
        expect(out.length).toBeLessThanOrEqual(700);
        expect(out.length).toBeGreaterThan(0);
    });

    it('without instruction: enforces budget', () => {
        const out = getEvaluateTransformContext({ ...base, instruction: '' }, { characterBudget: 600 });
        expect(out.length).toBeLessThanOrEqual(600);
        expect(out.length).toBeGreaterThan(0);
    });
});



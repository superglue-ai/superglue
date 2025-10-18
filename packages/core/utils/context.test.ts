import { describe, expect, it } from 'vitest';
import { getObjectContext } from './context.js';

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
    it('handles extremely deep objects within 2s and respects budget', () => {
        const deep = buildDeepObject(100, 100);
        const budget = 20_000;
        const { ms, result } = timeIt(() => getObjectContext(deep, { characterBudget: budget }));
        expect(ms).toBeLessThanOrEqual(2000);
        expect(result.length).toBeLessThanOrEqual(budget + 50); // headers may slightly exceed share but not budget
    });

    it('handles very wide objects within 2s and respects budget', () => {
        // Use a large but reasonable number; the preview logic caps keys per level
        const wide = buildWideObject(1_000_000);
        const budget = 15_000;
        const { ms, result } = timeIt(() => getObjectContext(wide, { characterBudget: budget }));
        expect(ms).toBeLessThanOrEqual(2000);
        expect(result.length).toBeLessThanOrEqual(budget + 50);
    });

    it('handles insanely long arrays within 2s and respects budget', () => {
        const obj = { data: buildLongArray(1_000_000) };
        const budget = 12_000;
        const { ms, result } = timeIt(() => getObjectContext(obj, { characterBudget: budget }));
        expect(ms).toBeLessThanOrEqual(2000);
        expect(result.length).toBeLessThanOrEqual(budget + 50);
    });

    it('small budget strictly enforced', () => {
        const obj = { a: buildLongArray(1_000_000), b: buildDeepObject(50, 10) };
        const budget = 2000;
        const { result } = timeIt(() => getObjectContext(obj, { characterBudget: budget }));
        expect(result.length).toBeLessThanOrEqual(budget + 10);
    });

    it('omits sections not requested', () => {
        const obj = { a: [1, 2, 3], b: { c: 1 } };
        const budget = 4000;
        const { result } = timeIt(() => getObjectContext(obj, { characterBudget: budget, include: { schema: false, preview: true, samples: false } }));
        expect(result).toMatch(/## Object Preview/);
        expect(result).not.toMatch(/## Schema/);
        expect(result).not.toMatch(/## Samples/);
    });
});



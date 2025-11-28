import { inferJsonSchema } from '@superglue/shared';
import { sanitizeUnpairedSurrogates } from '../utils/helpers.js';

export function mergeSectionsWithNewlines(sections: string[]): string {
    return sections.join('\n\n');
}

export function buildSchemaSection(obj: any, share: number): { text: string } {
    if (share <= 0) return { text: '' };
    try {
        const schemaObj = inferJsonSchema(obj);
        const schemaStr = JSON.stringify(schemaObj);
        const header = `<schema> (first ${share} characters shown)\n`;
        const body = schemaStr.length <= Math.max(0, share - header.length - 1)
            ? schemaStr
            : schemaStr.slice(0, Math.max(0, share - header.length - 16)) + '... [truncated]';
        return { text: header + body + '</schema>' };
    } catch {
        return { text: '' };
    }
}

export function buildPreviewSection(obj: any, share: number, depthLimit: number, arrayLimit: number, objectKeyLimit: number): { text: string } {
    if (share <= 0) return { text: '' };
    const header = `<object_preview> (first ${share} characters shown)\n`;
    const limited = stringifyWithLimits(obj, depthLimit, arrayLimit, objectKeyLimit, true);
    const body = limited.length <= Math.max(0, share - header.length - 1)
        ? limited
        : limited.slice(0, Math.max(0, share - header.length - 16)) + '... [truncated]';
    return { text: header + body + '</object_preview>' };
}

export function buildFullObjectSection(full: string): string {
    const header = '<full_object>\n';
    return header + full + '</full_object>';
}

export function buildSamplesSection(
    obj: any,
    share: number,
    depthLimit: number,
    arrayLimit: number,
    objectKeyLimit: number,
    maxArrayPaths: number,
    itemsPerArray: number,
    sampleDepth: number
): { text: string } {
    if (share <= 0) return { text: '' };

    const blocks: string[] = [];
    const header = `## Samples (root snapshot + up to ${itemsPerArray} items per array path)\n`;
    let used = header.length;

    // Add a compact root snapshot first to anchor context
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const rootHeader = 'root:\n';
        const rootLine = compactSampleItem(obj, 0, sampleDepth) + '\n';
        if (used + rootHeader.length + rootLine.length <= share) {
            blocks.push(rootHeader, rootLine);
            used += rootHeader.length + rootLine.length;
        } else if (used + rootHeader.length < share) {
            const remain = share - used - rootHeader.length;
            blocks.push(rootHeader);
            blocks.push(rootLine.slice(0, Math.max(0, remain - 15)) + '...[truncated]');
            used = share;
        }
    }

    // Find up to N array paths by scanning DFS and selecting longest arrays first
    const paths: Array<{ path: string; value: any[] }> = [];
    collectArrayPaths(obj, '$', 0, paths, depthLimit, arrayLimit, objectKeyLimit);
    paths.sort((a, b) => b.value.length - a.value.length);
    const selected = paths.slice(0, maxArrayPaths);

    for (const p of selected) {
        const header = `${p.path} (len=${p.value.length}):\n`;
        if (used + header.length >= share) break;
        blocks.push(header);
        used += header.length;

        const items = randomSampleHeadAware(p.value, itemsPerArray);
        for (const it of items) {
            const line = compactSampleItem(it, 0, sampleDepth) + '\n';
            if (used + line.length > share) { blocks.push('... [truncated]'); used = share; break; }
            blocks.push(line); used += line.length;
        }
        if (used >= share) break;
    }

    if (blocks.length === 0) return { text: header };
    return { text: header + blocks.join('') + '</samples>' };
}


export function stringifyWithLimits(value: any, depthLimit: number, arrayLimit: number, objectKeyLimit: number, limit: boolean): string {
    const seen = new WeakSet<object>();
    function walk(v: any, depth: number): any {
        if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
        }
        if (depth >= depthLimit) return ellipsisFor(v);
        if (Array.isArray(v)) {
            if (!limit || v.length <= arrayLimit) return v.map(x => walk(x, depth + 1));
            const slice = v.slice(0, arrayLimit).map(x => walk(x, depth + 1));
            return [...slice, `... (len=${v.length})`];
        }
        if (v && typeof v === 'object') {
            const out: Record<string, any> = {};
            const keys = Object.keys(v).sort();
            const limitedKeys = limit ? keys.slice(0, objectKeyLimit) : keys;
            for (const k of limitedKeys) out[k] = walk(v[k], depth + 1);
            return out;
        }
        if (typeof v === 'string') return sanitizeUnpairedSurrogates(v);
        if (typeof v === 'bigint') return String(v);
        if (v instanceof Date) return v.toISOString();
        return v;
    }
    try { return JSON.stringify(walk(value, 0)); } catch { return String(value ?? ''); }
}

export function ellipsisFor(v: any): any {
    if (Array.isArray(v)) return `array(len=${v.length})`;
    if (v && typeof v === 'object') return '{…}';
    return '…';
}

export function collectArrayPaths(v: any, path: string, depth: number, acc: Array<{ path: string; value: any[] }>, depthLimit: number, arrayLimit: number, objectKeyLimit: number): void {
    if (depth > depthLimit) return;
    if (Array.isArray(v)) {
        acc.push({ path, value: v });
        for (let i = 0; i < Math.min(v.length, arrayLimit); i++) {
            collectArrayPaths(v[i], `${path}[${i}]`, depth + 1, acc, depthLimit, arrayLimit, objectKeyLimit);
        }
        return;
    }
    if (v && typeof v === 'object') {
        const keys = Object.keys(v).sort().slice(0, objectKeyLimit);
        for (const k of keys) collectArrayPaths(v[k], `${path}.${k}`, depth + 1, acc, depthLimit, arrayLimit, objectKeyLimit);
    }
}

export function randomSampleHeadAware(arr: any[], count: number): any[] {
    if (arr.length <= count) return arr.slice();
    // Pick one from head (index 0) if possible, rest random unique picks
    const picks = new Set<number>();
    picks.add(0);
    while (picks.size < Math.min(count, arr.length)) {
        picks.add(Math.floor(Math.random() * arr.length));
    }
    return Array.from(picks.values()).map(i => arr[i]);
}

export function compactSampleItem(v: any, depth: number = 0, maxDepth: number = 5): string {
    if (v === null || typeof v !== 'object') {
        if (typeof v === 'string') {
            return JSON.stringify(sanitizeUnpairedSurrogates(v));
        }
        return JSON.stringify(v);
    }
    if (Array.isArray(v)) {
        const MAX_ITEMS = 3;
        if (v.length === 0) return JSON.stringify([]);
        if (depth >= maxDepth) return JSON.stringify(`array(len=${v.length})`);
        const items = v.slice(0, MAX_ITEMS).map(x => {
            if (x && typeof x === 'object') {
                return JSON.parse(compactSampleItem(x, depth + 1, maxDepth));
            }
            if (typeof x === 'string') {
                return sanitizeUnpairedSurrogates(x);
            }
            return x;
        });
        if (v.length > MAX_ITEMS) items.push(`... (len=${v.length})`);
        return JSON.stringify(items);
    }
    const out: Record<string, any> = {};
    const keys = Object.keys(v).sort();
    const MAX_KEYS = 20;
    for (let i = 0; i < Math.min(keys.length, MAX_KEYS); i++) {
        const k = keys[i];
        const val = v[k];
        if (Array.isArray(val)) {
            if (depth < maxDepth) {
                const arr = val as any[];
                const MAX_ITEMS = 2;
                const items = arr.slice(0, MAX_ITEMS).map(x => {
                    if (x && typeof x === 'object') {
                        return JSON.parse(compactSampleItem(x, depth + 1, maxDepth));
                    }
                    if (typeof x === 'string') {
                        return sanitizeUnpairedSurrogates(x);
                    }
                    return x;
                });
                if (arr.length > MAX_ITEMS) items.push(`... (len=${arr.length})`);
                out[k] = items;
            } else {
                out[k] = `array(len=${val.length})`;
            }
        } else if (val && typeof val === 'object') {
            if (depth < maxDepth) {
                out[k] = JSON.parse(compactSampleItem(val, depth + 1, maxDepth));
            } else {
                out[k] = '{…}';
            }
        } else if (typeof val === 'string') {
            const sanitized = sanitizeUnpairedSurrogates(val);
            out[k] = sanitized.length <= 200 ? sanitized : sanitized.slice(0, 200) + '…';
        } else if (typeof val === 'bigint') {
            out[k] = String(val);
        } else if (val instanceof Date) {
            out[k] = val.toISOString();
        } else {
            out[k] = val;
        }
    }
    return JSON.stringify(out);
}
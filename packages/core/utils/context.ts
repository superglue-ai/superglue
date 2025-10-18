import { inferJsonSchema } from '@superglue/shared';

export type ObjectContextOptions = {
    characterBudget: number;
    include?: { schema?: boolean; preview?: boolean; samples?: boolean };
};

const SMALL_JSON_THRESHOLD_DEFAULT = 10_000;
const PREVIEW_DEPTH_LIMIT = 10;
const PREVIEW_ARRAY_LIMIT = 10;
const SAMPLES_MAX_ARRAY_PATHS = 5;
const SAMPLES_ITEMS_PER_ARRAY = 5;
const SAMPLE_OBJECT_MAX_DEPTH = 5;

export function getObjectContext(obj: any, opts: ObjectContextOptions): string {
    const includeSchema = opts.include?.schema !== false;
    const includePreview = opts.include?.preview !== false;
    const includeSamples = opts.include?.samples !== false;
    const enabledParts: Array<'schema' | 'preview' | 'samples'> = [];
    if (includeSchema) enabledParts.push('schema');
    if (includePreview) enabledParts.push('preview');
    if (includeSamples) enabledParts.push('samples');
    if (enabledParts.length === 0) return '';

    const budget = Math.max(0, opts.characterBudget | 0);
    if (budget === 0) return '';

    const perShare = Math.floor(budget / enabledParts.length);

    let remainingCarry = 0;
    const sections: string[] = [];

    if (includeSchema) {
        const share = perShare + remainingCarry;
        const schemaStr = buildSchemaSection(obj, share);
        sections.push(schemaStr.text);
        remainingCarry = Math.max(0, share - schemaStr.text.length);
    }

    if (includePreview) {
        const share = perShare + remainingCarry;
        const previewStr = buildPreviewSection(obj, share);
        sections.push(previewStr.text);
        remainingCarry = Math.max(0, share - previewStr.text.length);
    }

    if (includeSamples) {
        const share = perShare + remainingCarry;
        const samplesStr = buildSamplesSection(obj, share);
        sections.push(samplesStr.text);
        remainingCarry = Math.max(0, share - samplesStr.text.length);
    }

    const combined = sections.filter(Boolean).join('\n\n');
    return combined;
}

function buildSchemaSection(obj: any, share: number): { text: string } {
    if (share <= 0) return { text: '' };
    try {
        const schemaObj = inferJsonSchema(obj);
        const schemaStr = JSON.stringify(schemaObj);
        const header = `## Schema (first ${share} characters shown)\n`;
        const body = schemaStr.length <= Math.max(0, share - header.length - 1)
            ? schemaStr
            : schemaStr.slice(0, Math.max(0, share - header.length - 16)) + '... [truncated]';
        return { text: header + body };
    } catch {
        return { text: '' };
    }
}

function buildPreviewSection(obj: any, share: number): { text: string } {
    if (share <= 0) return { text: '' };
    const smallJsonThreshold = Math.min(SMALL_JSON_THRESHOLD_DEFAULT, share);

    const header = `## Object Preview (first ${share} characters shown)\n`;
    const full = safeStringify(obj);
    if (full.length <= smallJsonThreshold) {
        const body = full.length <= Math.max(0, share - header.length - 1)
            ? full
            : full.slice(0, Math.max(0, share - header.length - 16)) + '... [truncated]';
        return { text: header + body };
    }

    const limited = safeStringifyPreview(obj, PREVIEW_DEPTH_LIMIT, PREVIEW_ARRAY_LIMIT);
    const body = limited.length <= Math.max(0, share - header.length - 1)
        ? limited
        : limited.slice(0, Math.max(0, share - header.length - 16)) + '... [truncated]';
    return { text: header + body };
}

function buildSamplesSection(obj: any, share: number): { text: string } {
    if (share <= 0) return { text: '' };

    const blocks: string[] = [];
    const header = `## Samples (root snapshot + up to ${SAMPLES_ITEMS_PER_ARRAY} items per array path)\n`;
    let used = header.length;

    // Add a compact root snapshot first to anchor context
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const rootHeader = 'root:\n';
        const rootLine = compactSampleItem(obj) + '\n';
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
    collectArrayPaths(obj, '$', 0, paths);
    paths.sort((a, b) => b.value.length - a.value.length);
    const selected = paths.slice(0, SAMPLES_MAX_ARRAY_PATHS);

    for (const p of selected) {
        const header = `${p.path} (len=${p.value.length}):\n`;
        if (used + header.length >= share) break;
        blocks.push(header);
        used += header.length;

        const items = randomSampleHeadAware(p.value, SAMPLES_ITEMS_PER_ARRAY);
        for (const it of items) {
            const line = compactSampleItem(it) + '\n';
            if (used + line.length > share) { blocks.push('... [truncated]'); used = share; break; }
            blocks.push(line); used += line.length;
        }
        if (used >= share) break;
    }

    if (blocks.length === 0) return { text: header };
    return { text: header + blocks.join('') };
}

function safeStringify(value: any): string {
    const seen = new WeakSet<object>();
    try {
        return JSON.stringify(value, (k, v) => {
            if (typeof v === 'object' && v !== null) {
                if (seen.has(v)) return '[Circular]';
                seen.add(v);
            }
            if (typeof v === 'bigint') return String(v);
            if (v instanceof Date) return v.toISOString();
            return v;
        });
    } catch {
        return String(value ?? '');
    }
}

// Depth/breadth limited stringify for preview
function safeStringifyPreview(value: any, depthLimit: number, arrayLimit: number): string {
    function walk(v: any, depth: number): any {
        if (depth >= depthLimit) return ellipsisFor(v);
        if (Array.isArray(v)) {
            if (v.length <= arrayLimit) return v.map(x => walk(x, depth + 1));
            const slice = v.slice(0, arrayLimit).map(x => walk(x, depth + 1));
            return [...slice, `... (len=${v.length})`];
        }
        if (v && typeof v === 'object') {
            const out: Record<string, any> = {};
            const keys = Object.keys(v).sort();
            for (const k of keys) {
                out[k] = walk(v[k], depth + 1);
            }
            return out;
        }
        if (typeof v === 'bigint') return String(v);
        if (v instanceof Date) return v.toISOString();
        return v;
    }
    const limited = walk(value, 0);
    return JSON.stringify(limited);
}

function ellipsisFor(v: any): any {
    if (Array.isArray(v)) return `array(len=${v.length})`;
    if (v && typeof v === 'object') return '{…}';
    return '…';
}

function collectArrayPaths(v: any, path: string, depth: number, acc: Array<{ path: string; value: any[] }>): void {
    if (depth > PREVIEW_DEPTH_LIMIT) return;
    if (Array.isArray(v)) {
        acc.push({ path, value: v });
        for (let i = 0; i < Math.min(v.length, PREVIEW_ARRAY_LIMIT); i++) {
            collectArrayPaths(v[i], `${path}[${i}]`, depth + 1, acc);
        }
        return;
    }
    if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) collectArrayPaths(v[k], `${path}.${k}`, depth + 1, acc);
    }
}

function randomSampleHeadAware(arr: any[], count: number): any[] {
    if (arr.length <= count) return arr.slice();
    // Pick one from head (index 0) if possible, rest random unique picks
    const picks = new Set<number>();
    picks.add(0);
    while (picks.size < Math.min(count, arr.length)) {
        picks.add(Math.floor(Math.random() * arr.length));
    }
    return Array.from(picks.values()).map(i => arr[i]);
}

function compactSampleItem(v: any, depth: number = 0): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) {
        const MAX_ITEMS = 3;
        if (v.length === 0) return JSON.stringify([]);
        if (depth >= SAMPLE_OBJECT_MAX_DEPTH) return JSON.stringify(`array(len=${v.length})`);
        const items = v.slice(0, MAX_ITEMS).map(x => {
            if (x && typeof x === 'object') {
                return JSON.parse(compactSampleItem(x, depth + 1));
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
            if (depth < SAMPLE_OBJECT_MAX_DEPTH) {
                // include small nested array preview
                const arr = val as any[];
                const MAX_ITEMS = 2;
                const items = arr.slice(0, MAX_ITEMS).map(x => (x && typeof x === 'object') ? JSON.parse(compactSampleItem(x, depth + 1)) : x);
                if (arr.length > MAX_ITEMS) items.push(`... (len=${arr.length})`);
                out[k] = items;
            } else {
                out[k] = `array(len=${val.length})`;
            }
        } else if (val && typeof val === 'object') {
            if (depth < SAMPLE_OBJECT_MAX_DEPTH) {
                out[k] = JSON.parse(compactSampleItem(val, depth + 1));
            } else {
                out[k] = '{…}';
            }
        } else if (typeof val === 'string') {
            out[k] = val.length <= 200 ? val : val.slice(0, 200) + '…';
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



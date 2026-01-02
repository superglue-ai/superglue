import ivm from "isolated-vm";
import { describe, expect, it } from "vitest";
import { injectVMHelpersIndividually } from "./vm-helpers.js";

describe("VM Helpers", () => {
  describe("injectVMHelpersIndividually", () => {
    it("should inject btoa function that encodes base64", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test basic base64 encoding
      const result = await context.eval(`
                btoa('Hello World')
            `);
      expect(result).toBe("SGVsbG8gV29ybGQ=");
    });

    it("should inject atob function that decodes base64", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test basic base64 decoding
      const result = await context.eval(`
                atob('SGVsbG8gV29ybGQ=')
            `);
      expect(result).toBe("Hello World");
    });

    it("should handle URL-safe base64 in atob", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test URL-safe base64 (- and _ characters)
      const result = await context.eval(`
                atob('SGVsbG8tV29ybGRf')
            `);
      expect(result).toBeTruthy();
    });

    it("should inject escape function", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test escape function
      const result = await context.eval(`
                escape('Hello World!')
            `);
      expect(result).toBe("Hello%20World!");
    });

    it("should inject decodeURIComponent function", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test decodeURIComponent
      const result = await context.eval(`
                decodeURIComponent('Hello%20World%21')
            `);
      expect(result).toBe("Hello World!");
    });

    it("should inject Buffer.from for base64 decoding", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test Buffer.from with base64
      const result = await context.eval(`
                Buffer.from('SGVsbG8gV29ybGQ=', 'base64').toString('utf-8')
            `);
      expect(result).toBe("Hello World");
    });

    it("should handle UTF-8 decoding with Buffer", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test UTF-8 handling
      const result = await context.eval(`
                const base64 = 'eyJuYW1lIjoi8J+YgCJ9'; // {"name":"😀"}
                const decoded = Buffer.from(base64, 'base64').toString('utf-8');
                JSON.parse(decoded).name
            `);
      expect(result).toBe("😀");
    });

    it("should handle complex base64 decoding scenarios", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test complex scenario combining multiple helpers
      const result = await context.eval(`
                const base64 = 'eyJ1cmwiOiJodHRwcyUzQSUyRiUyRmV4YW1wbGUuY29tJTJGcGF0aCUzRnF1ZXJ5JTNEdmFsdWUifQ==';
                const decoded = atob(base64);
                const parsed = JSON.parse(decoded);
                decodeURIComponent(parsed.url);
            `);
      expect(result).toBe("https://example.com/path?query=value");
    });

    it("should handle btoa edge cases", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test empty string
      const empty = await context.eval(`btoa('')`);
      expect(empty).toBe("");

      // Test string with special characters within Latin1 range
      const special = await context.eval(`btoa('Hello\\n\\r\\t!')`);
      expect(special).toBe("SGVsbG8KDQkh");

      // Test Latin1 characters (0-255)
      const latin1 = await context.eval(`btoa('café')`);
      expect(latin1).toBeTruthy();
    });

    it("should throw error for non-Latin1 characters in btoa", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test with emoji (outside Latin1 range)
      await expect(context.eval(`btoa('Hello 😀')`)).rejects.toThrow("btoa failed");
    });

    it("should handle btoa/atob round-trip correctly", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test round-trip encoding/decoding
      const result = await context.eval(`
                const original = 'The quick brown fox jumps over the lazy dog!@#$%^&*()_+-=[]{}|;:,.<>?';
                const encoded = btoa(original);
                const decoded = atob(encoded);
                decoded === original;
            `);
      expect(result).toBe(true);
    });

    it("should handle btoa padding correctly", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test different string lengths to ensure proper padding
      const oneChar = await context.eval(`btoa('a')`);
      expect(oneChar).toBe("YQ=="); // Should have 2 padding chars

      const twoChars = await context.eval(`btoa('ab')`);
      expect(twoChars).toBe("YWI="); // Should have 1 padding char

      const threeChars = await context.eval(`btoa('abc')`);
      expect(threeChars).toBe("YWJj"); // Should have no padding
    });

    it("should inject URL constructor that parses URLs", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test basic URL parsing
      const result = await context.eval(`
                const url = new URL('https://example.com:8080/path?query=value#hash');
                JSON.stringify({
                    href: url.href,
                    protocol: url.protocol,
                    hostname: url.hostname,
                    port: url.port,
                    pathname: url.pathname,
                    search: url.search,
                    hash: url.hash
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.protocol).toBe("https:");
      expect(parsed.hostname).toBe("example.com");
      expect(parsed.port).toBe("8080");
      expect(parsed.pathname).toBe("/path");
      expect(parsed.search).toBe("?query=value");
      expect(parsed.hash).toBe("#hash");
    });

    it("should handle URL with base parameter", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test URL with base
      const result = await context.eval(`
                const url = new URL('/api/users', 'https://example.com');
                url.href
            `);

      expect(result).toBe("https://example.com/api/users");
    });

    it("should inject crypto.randomUUID that generates UUIDs", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Test crypto.randomUUID
      const uuid = await context.eval(`crypto.randomUUID()`);

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it("should generate unique UUIDs", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      // Generate multiple UUIDs and ensure they're unique
      const result = await context.eval(`
                const uuid1 = crypto.randomUUID();
                const uuid2 = crypto.randomUUID();
                const uuid3 = crypto.randomUUID();
                JSON.stringify({ uuid1, uuid2, uuid3, allUnique: uuid1 !== uuid2 && uuid2 !== uuid3 && uuid1 !== uuid3 })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.allUnique).toBe(true);
    });

    it("should inject String.prototype.matchAll", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const str = 'test1test2test3';
                const matches = [...str.matchAll(/test(\\d)/g)];
                JSON.stringify({
                    count: matches.length,
                    first: matches[0][1],
                    second: matches[1][1],
                    third: matches[2][1]
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.count).toBe(3);
      expect(parsed.first).toBe("1");
      expect(parsed.second).toBe("2");
      expect(parsed.third).toBe("3");
    });

    it("should throw error for non-global regex in matchAll", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      await expect(
        context.eval(`
                'test'.matchAll(/test/)
            `),
      ).rejects.toThrow();
    });

    it("should inject String.prototype.replaceAll", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                'foo bar foo baz foo'.replaceAll('foo', 'qux')
            `);

      expect(result).toBe("qux bar qux baz qux");
    });

    it("should handle replaceAll with regex", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                'test1 test2 test3'.replaceAll(/test\\d/g, 'replaced')
            `);

      expect(result).toBe("replaced replaced replaced");
    });

    it("should inject String.prototype.trimStart and trimEnd", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const str = '  hello world  ';
                JSON.stringify({
                    trimStart: str.trimStart(),
                    trimEnd: str.trimEnd(),
                    trimLeft: str.trimLeft(),
                    trimRight: str.trimRight()
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.trimStart).toBe("hello world  ");
      expect(parsed.trimEnd).toBe("  hello world");
      expect(parsed.trimLeft).toBe("hello world  ");
      expect(parsed.trimRight).toBe("  hello world");
    });

    it("should inject String.prototype.padStart and padEnd", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const str = '5';
                JSON.stringify({
                    padStart: str.padStart(3, '0'),
                    padEnd: str.padEnd(3, '0'),
                    padStartCustom: 'abc'.padStart(10, '123'),
                    padEndCustom: 'abc'.padEnd(10, '123')
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.padStart).toBe("005");
      expect(parsed.padEnd).toBe("500");
      expect(parsed.padStartCustom).toBe("1231231abc");
      expect(parsed.padEndCustom).toBe("abc1231231");
    });

    it("should inject String.prototype.at for negative indexing", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const str = 'hello';
                JSON.stringify({
                    last: str.at(-1),
                    secondLast: str.at(-2),
                    first: str.at(0),
                    outOfBounds: str.at(10)
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.last).toBe("o");
      expect(parsed.secondLast).toBe("l");
      expect(parsed.first).toBe("h");
      expect(parsed.outOfBounds).toBeUndefined();
    });

    it("should inject Array.prototype.flat", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const nested = [1, [2, 3], [4, [5, 6]]];
                JSON.stringify({
                    flat1: nested.flat(),
                    flat2: nested.flat(2),
                    flatInfinity: nested.flat(Infinity)
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.flat1).toEqual([1, 2, 3, 4, [5, 6]]);
      expect(parsed.flat2).toEqual([1, 2, 3, 4, 5, 6]);
      expect(parsed.flatInfinity).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("should inject Array.prototype.flatMap", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const arr = [1, 2, 3];
                JSON.stringify(arr.flatMap(x => [x, x * 2]))
            `);

      expect(JSON.parse(result)).toEqual([1, 2, 2, 4, 3, 6]);
    });

    it("should inject Array.prototype.at for negative indexing", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const arr = ['a', 'b', 'c', 'd'];
                JSON.stringify({
                    last: arr.at(-1),
                    secondLast: arr.at(-2),
                    first: arr.at(0),
                    outOfBounds: arr.at(10)
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.last).toBe("d");
      expect(parsed.secondLast).toBe("c");
      expect(parsed.first).toBe("a");
      expect(parsed.outOfBounds).toBeUndefined();
    });

    it("should inject Array.prototype.findLast and findLastIndex", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const arr = [1, 2, 3, 4, 5, 4, 3, 2, 1];
                JSON.stringify({
                    findLast: arr.findLast(x => x > 3),
                    findLastIndex: arr.findLastIndex(x => x > 3),
                    findLastNotFound: arr.findLast(x => x > 10),
                    findLastIndexNotFound: arr.findLastIndex(x => x > 10)
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.findLast).toBe(4);
      expect(parsed.findLastIndex).toBe(5);
      expect(parsed.findLastNotFound).toBeUndefined();
      expect(parsed.findLastIndexNotFound).toBe(-1);
    });

    it("should inject Object.fromEntries", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const entries = [['a', 1], ['b', 2], ['c', 3]];
                JSON.stringify(Object.fromEntries(entries))
            `);

      expect(JSON.parse(result)).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("should inject Object.hasOwn", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const obj = { a: 1, b: 2 };
                JSON.stringify({
                    hasA: Object.hasOwn(obj, 'a'),
                    hasC: Object.hasOwn(obj, 'c'),
                    hasToString: Object.hasOwn(obj, 'toString')
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.hasA).toBe(true);
      expect(parsed.hasC).toBe(false);
      expect(parsed.hasToString).toBe(false);
    });

    it("should handle complex real-world scenario with multiple polyfills", async () => {
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = await isolate.createContext();

      await injectVMHelpersIndividually(context);

      const result = await context.eval(`
                const data = [
                    { id: 1, tags: ['foo', 'bar'] },
                    { id: 2, tags: ['baz', 'foo'] },
                    { id: 3, tags: ['qux'] }
                ];
                
                // Use flatMap to get all tags
                const allTags = data.flatMap(item => item.tags);
                
                // Use matchAll to find 'foo' occurrences
                const fooMatches = [...allTags.join(',').matchAll(/foo/g)];
                
                // Use findLast to get last item with 'foo'
                const lastWithFoo = data.findLast(item => item.tags.includes('foo'));
                
                // Use Object.fromEntries to create a map
                const tagMap = Object.fromEntries(allTags.map((tag, i) => [tag, i]));
                
                // Use at for negative indexing
                const lastTag = allTags.at(-1);
                
                JSON.stringify({
                    allTags,
                    fooCount: fooMatches.length,
                    lastWithFooId: lastWithFoo.id,
                    hasQux: Object.hasOwn(tagMap, 'qux'),
                    lastTag
                })
            `);

      const parsed = JSON.parse(result);
      expect(parsed.allTags).toEqual(["foo", "bar", "baz", "foo", "qux"]);
      expect(parsed.fooCount).toBe(2);
      expect(parsed.lastWithFooId).toBe(2);
      expect(parsed.hasQux).toBe(true);
      expect(parsed.lastTag).toBe("qux");
    });
  });
});

import ivm from 'isolated-vm';
import { describe, expect, it } from 'vitest';
import { injectVMHelpersIndividually } from './vm-helpers.js';

describe('VM Helpers', () => {
    describe('injectVMHelpersIndividually', () => {
        it('should inject btoa function that encodes base64', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test basic base64 encoding
            const result = await context.eval(`
                btoa('Hello World')
            `);
            expect(result).toBe('SGVsbG8gV29ybGQ=');
        });
        
        it('should inject atob function that decodes base64', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test basic base64 decoding
            const result = await context.eval(`
                atob('SGVsbG8gV29ybGQ=')
            `);
            expect(result).toBe('Hello World');
        });
        
        it('should handle URL-safe base64 in atob', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test URL-safe base64 (- and _ characters)
            const result = await context.eval(`
                atob('SGVsbG8tV29ybGRf')
            `);
            expect(result).toBeTruthy();
        });
        
        it('should inject escape function', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test escape function
            const result = await context.eval(`
                escape('Hello World!')
            `);
            expect(result).toBe('Hello%20World!');
        });
        
        it('should inject decodeURIComponent function', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test decodeURIComponent
            const result = await context.eval(`
                decodeURIComponent('Hello%20World%21')
            `);
            expect(result).toBe('Hello World!');
        });
        
        it('should inject Buffer.from for base64 decoding', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test Buffer.from with base64
            const result = await context.eval(`
                Buffer.from('SGVsbG8gV29ybGQ=', 'base64').toString('utf-8')
            `);
            expect(result).toBe('Hello World');
        });
        
        it('should handle UTF-8 decoding with Buffer', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test UTF-8 handling
            const result = await context.eval(`
                const base64 = 'eyJuYW1lIjoi8J+YgCJ9'; // {"name":"😀"}
                const decoded = Buffer.from(base64, 'base64').toString('utf-8');
                JSON.parse(decoded).name
            `);
            expect(result).toBe('😀');
        });
        
        it('should handle complex base64 decoding scenarios', async () => {
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
            expect(result).toBe('https://example.com/path?query=value');
        });
        
        it('should handle btoa edge cases', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test empty string
            const empty = await context.eval(`btoa('')`);
            expect(empty).toBe('');
            
            // Test string with special characters within Latin1 range
            const special = await context.eval(`btoa('Hello\\n\\r\\t!')`);
            expect(special).toBe('SGVsbG8KDQkh');
            
            // Test Latin1 characters (0-255)
            const latin1 = await context.eval(`btoa('café')`); 
            expect(latin1).toBeTruthy();
        });
        
        it('should throw error for non-Latin1 characters in btoa', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test with emoji (outside Latin1 range)
            await expect(context.eval(`btoa('Hello 😀')`)).rejects.toThrow('btoa failed');
        });
        
        it('should handle btoa/atob round-trip correctly', async () => {
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
        
        it('should handle btoa padding correctly', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test different string lengths to ensure proper padding
            const oneChar = await context.eval(`btoa('a')`);
            expect(oneChar).toBe('YQ=='); // Should have 2 padding chars
            
            const twoChars = await context.eval(`btoa('ab')`);
            expect(twoChars).toBe('YWI='); // Should have 1 padding char
            
            const threeChars = await context.eval(`btoa('abc')`);
            expect(threeChars).toBe('YWJj'); // Should have no padding
        });

        it('should inject URL constructor that parses URLs', async () => {
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
            expect(parsed.protocol).toBe('https:');
            expect(parsed.hostname).toBe('example.com');
            expect(parsed.port).toBe('8080');
            expect(parsed.pathname).toBe('/path');
            expect(parsed.search).toBe('?query=value');
            expect(parsed.hash).toBe('#hash');
        });

        it('should handle URL with base parameter', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test URL with base
            const result = await context.eval(`
                const url = new URL('/api/users', 'https://example.com');
                url.href
            `);
            
            expect(result).toBe('https://example.com/api/users');
        });

        it('should inject crypto.randomUUID that generates UUIDs', async () => {
            const isolate = new ivm.Isolate({ memoryLimit: 128 });
            const context = await isolate.createContext();
            
            await injectVMHelpersIndividually(context);
            
            // Test crypto.randomUUID
            const uuid = await context.eval(`crypto.randomUUID()`);
            
            // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuid).toMatch(uuidRegex);
        });

        it('should generate unique UUIDs', async () => {
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
    });
}); 
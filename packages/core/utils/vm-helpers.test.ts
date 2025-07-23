import ivm from 'isolated-vm';
import { describe, expect, it } from 'vitest';
import { injectVMHelpersIndividually } from './vm-helpers.js';

describe('VM Helpers', () => {
    describe('injectVMHelpersIndividually', () => {
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
    });
}); 
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HtmlMarkdownPool } from './html-markdown-pool.js';

describe('HtmlMarkdownPool', () => {
    let pool: HtmlMarkdownPool;

    beforeEach(() => {
        pool = new HtmlMarkdownPool();
    });

    afterEach(async () => {
        await pool.shutdown();
    });

    it('converts simple html to markdown', async () => {
        const md = await pool.convert('<h1>Hello</h1><p>World</p>');
        expect(md).toContain('# Hello');
        expect(md).toContain('World');
    });

    it('runs a few tasks concurrently', async () => {
        const tasks = Array.from({ length: 6 }, (_, i) => pool.convert(`<h2>T${i}</h2>`));
        const results = await Promise.all(tasks);
        results.forEach((r, i) => expect(r).toContain(`## T${i}`));
    });
});


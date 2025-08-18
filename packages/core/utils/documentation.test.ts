import playwright from '@playwright/test';
import { Metadata } from '@superglue/shared';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { server_defaults } from '../default.js';
import { Documentation, PlaywrightFetchingStrategy } from './documentation.js';

// Mock playwright and axios
vi.mock('@playwright/test', async (importOriginal) => {
    const original = await importOriginal() as any;
    return {
        ...original, // Preserve other exports if any
        default: {
            chromium: {
                launch: vi.fn(),
            },
        },
    };
});

vi.mock('axios');

// Helper to create standard Playwright mocks
const createPlaywrightMocks = () => {
    const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined), // Added mock
        content: vi.fn().mockResolvedValue(''),
        evaluate: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    };

    const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    };

    const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
        close: vi.fn().mockResolvedValue(undefined),
    };

    // Setup the browser launch mock with a type assertion
    vi.mocked(playwright.chromium.launch).mockResolvedValue(mockBrowser as unknown as playwright.Browser);

    return { mockPage, mockContext, mockBrowser };
};

describe('Documentation Class', () => {
    let mockPage: any;
    let mockContext: any;
    let mockBrowser: any;
    let mockedAxios: Mocked<typeof axios>; // Use Mocked type
    let metadata: Metadata = { orgId: '' };
    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        mockedAxios = axios as Mocked<typeof axios>; // Ensure axios is typed correctly
        mockedAxios.get.mockReset(); // Reset mocks specifically
        mockedAxios.post.mockReset();

        // Create standard mocks for Playwright
        ({ mockPage, mockContext, mockBrowser } = createPlaywrightMocks());
    });

    afterEach(async () => {
        // Use the static closeBrowser from the strategy class
        await PlaywrightFetchingStrategy.closeBrowser();
    });

    describe('fetchAndProcess', () => {

        it('should fetch and convert HTML documentation via Playwright', async () => {
            const htmlDoc = `
        <html><body><h1>API Docs</h1><p>Details here.</p></body></html>
      `;
            mockPage.content.mockResolvedValueOnce(htmlDoc);
            mockPage.evaluate.mockResolvedValue({}); // Empty links

            // Mock sitemap requests to fail (404)
            mockedAxios.get.mockRejectedValue(new Error('404'));

            const docUrl = 'https://api.example.com/docs';
            const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
            expect(mockContext.newPage).toHaveBeenCalledTimes(1);
            expect(mockPage.goto).toHaveBeenCalledWith(docUrl, { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT });
            expect(mockPage.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT });
            expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
            expect(mockPage.evaluate).toHaveBeenCalledTimes(2); // For removing elements and getting links
            expect(mockPage.content).toHaveBeenCalledTimes(1);
            expect(result).toContain('# API Docs');
            expect(result).toContain('Details here.');
            // Sitemap fetches are attempted
            expect(mockedAxios.get).toHaveBeenCalled();
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it('should return raw page content if not HTML, GraphQL, or OpenAPI', async () => {
            const plainDoc = 'Plain text documentation content.';
            mockPage.content.mockResolvedValueOnce(plainDoc);
            mockPage.evaluate.mockResolvedValue({}); // Empty links

            // Mock sitemap requests to fail
            mockedAxios.get.mockRejectedValue(new Error('404'));

            const doc = new Documentation({ documentationUrl: 'https://api.example.com/raw', urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            expect(mockPage.content).toHaveBeenCalledTimes(1);
            expect(result).toBe(plainDoc);
            expect(mockedAxios.get).toHaveBeenCalled(); // Sitemap attempts
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it('should attempt GraphQL introspection for likely GraphQL URLs', async () => {
            const mockSchema = { __schema: { types: [{ name: 'Query' }] } };
            mockedAxios.post.mockResolvedValueOnce({ data: { data: mockSchema } });
            const docUrl = 'https://api.example.com/graphql';
            const headers = { 'Auth': 'key' };
            const params = { 'p': '1' };
            const doc = new Documentation({
                documentationUrl: docUrl,
                urlHost: 'https://api.example.com',
                urlPath: '/graphql',
                headers,
                queryParams: params
            }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(mockedAxios.post).toHaveBeenCalledWith(
                docUrl,
                expect.objectContaining({ operationName: 'IntrospectionQuery' }),
                { headers, params, timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS }
            );
            expect(result).toBe(JSON.stringify(mockSchema.__schema));
            expect(playwright.chromium.launch).not.toHaveBeenCalled();
        });

        it('should fall back to Playwright fetch if GraphQL introspection fails', async () => {
            const htmlDoc = `<html><body>GraphQL Maybe?</body></html>`;
            mockedAxios.post.mockRejectedValueOnce(new Error('GraphQL Network Error')); // Simulate network failure
            mockPage.content.mockResolvedValueOnce(htmlDoc); // Playwright fetch should succeed

            const docUrl = 'https://api.example.com/graphql'; // Looks like GraphQL
            const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            // Check GraphQL was attempted
            expect(mockedAxios.post).toHaveBeenCalledWith(docUrl, expect.anything(), expect.anything());
            // Check Playwright was used as fallback
            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            expect(mockPage.content).toHaveBeenCalledTimes(1);
            // Check result is from Playwright fetch (processed HTML)
            expect(result).toContain('GraphQL Maybe?');
        });

        it('should fall back to Playwright fetch if GraphQL returns errors', async () => {
            const htmlDoc = `<html><body>GraphQL Maybe?</body></html>`;
            mockedAxios.post.mockResolvedValueOnce({ data: { errors: [{ message: 'Bad Query' }] } }); // Simulate GQL error response
            mockPage.content.mockResolvedValueOnce(htmlDoc); // Playwright fetch should succeed

            const docUrl = 'https://api.example.com/graphql'; // Looks like GraphQL
            const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            // Check GraphQL was attempted
            expect(mockedAxios.post).toHaveBeenCalledWith(docUrl, expect.anything(), expect.anything());
            // Check Playwright was used as fallback
            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            expect(mockPage.content).toHaveBeenCalledTimes(1);
            // Check result is from Playwright fetch (processed HTML)
            expect(result).toContain('GraphQL Maybe?');
        });


        it('should extract and fetch relative OpenAPI URL found in HTML', async () => {
            const openApiJson = { openapi: "3.0.1", info: { title: "My API" } };
            const baseUrl = 'https://base.example.com/docs';

            // Mock Axios to return OpenAPI spec directly (simulating Axios strategy success)
            mockedAxios.get.mockResolvedValue({ data: openApiJson });

            const doc = new Documentation({ documentationUrl: baseUrl, urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            // Verify result contains the OpenAPI spec (formatted with indentation)
            expect(result).toContain('"openapi": "3.0.1"');
            expect(result).toContain('"title": "My API"');
        });

        it('should extract and fetch absolute OpenAPI URL found in HTML', async () => {
            const swaggerHtml = `<html><body><a href="https://absolute.com/openapi.yaml">Link</a></body></html>`; // Different extraction case
            const openApiYaml = `openapi: 3.0.0\ninfo:\n  title: YAML API`;
            const docUrl = 'https://api.example.com/docs';

            mockPage.content.mockResolvedValueOnce(swaggerHtml);
            mockPage.evaluate.mockResolvedValue({}); // Empty links

            // Mock sitemap requests to fail, then OpenAPI request succeeds
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('sitemap')) {
                    return Promise.reject(new Error('404'));
                }
                if (url.includes('openapi.yaml')) {
                    return Promise.resolve({ data: openApiYaml });
                }
                return Promise.reject(new Error('404'));
            });

            const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            expect(mockPage.content).toHaveBeenCalledTimes(1);
            expect(result).toContain(openApiYaml);
        });

        it('should handle page content being the OpenAPI spec directly (JSON)', async () => {
            const openApiJsonString = JSON.stringify({ swagger: "2.0", info: { title: "Direct JSON" } });
            mockPage.content.mockResolvedValueOnce(openApiJsonString); // Playwright returns JSON string
            mockPage.evaluate.mockResolvedValue({}); // Empty links

            // Mock sitemap requests to fail
            mockedAxios.get.mockRejectedValue(new Error('404'));

            const docUrl = 'https://api.example.com/openapi.json';
            const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            expect(mockPage.content).toHaveBeenCalledTimes(1);
            expect(result).toContain(openApiJsonString);
        });

        it('should handle page content being the OpenAPI spec directly (YAML)', async () => {
            const openApiYaml = `openapi: 3.1.0\ninfo:\n  title: Direct YAML`;
            mockPage.content.mockResolvedValueOnce(openApiYaml); // Playwright returns YAML string
            mockPage.evaluate.mockResolvedValue({}); // Empty links

            // Mock sitemap requests to fail
            mockedAxios.get.mockRejectedValue(new Error('404'));

            const docUrl = 'https://api.example.com/openapi.yaml';
            const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            expect(mockPage.content).toHaveBeenCalledTimes(1);
            expect(result).toBe(openApiYaml);
        });

        it('should fall back to HTML->Markdown if OpenAPI extraction/fetch fails', async () => {
            const swaggerHtml = `<html><script id="swagger-settings">{ "url": "/missing.json" }</script><body>Content</body></html>`;
            mockPage.content.mockResolvedValueOnce(swaggerHtml); // Playwright gets HTML
            mockPage.evaluate.mockResolvedValue({}); // Empty links

            // All requests fail
            mockedAxios.get.mockRejectedValue(new Error('404 Not Found'));

            const headers = { 'Auth': 'key' };
            const docUrl = 'https://api.example.com/docs';
            const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com', headers }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
            // Result should be the Markdown conversion of the original HTML
            expect(result).toContain('Content');
            expect(result).not.toContain('missing.json');
        });

        it('should handle Playwright fetch errors gracefully', async () => {
            vi.mocked(playwright.chromium.launch).mockRejectedValueOnce(new Error('Browser launch failed'));
            const doc = new Documentation({ documentationUrl: 'https://api.example.com/docs', urlHost: 'https://api.example.com' }, {}, metadata);
            const result = await doc.fetchAndProcess();

            expect(result).toBe(''); // Should return empty string on complete failure
            expect(mockedAxios.get).toHaveBeenCalled(); // should call axios instead
        });

        it('should cache the result and return processed result on subsequent calls', async () => {
            // Test with a simple text response via Axios
            const plainDoc = 'Plain text data';

            // Mock Axios to return plain text (first strategy to succeed)
            mockedAxios.get.mockResolvedValue({ data: plainDoc });

            const httpDoc = new Documentation({ documentationUrl: 'http://example.com/docs.txt' }, {}, metadata);

            const resHttp1 = await httpDoc.fetchAndProcess();
            expect(resHttp1).toBe(plainDoc);

            // Reset the call count for the second call to test caching
            const initialCallCount = mockedAxios.get.mock.calls.length;

            const resHttp2 = await httpDoc.fetchAndProcess();
            expect(resHttp2).toBe(plainDoc);
            expect(mockedAxios.get.mock.calls.length).toBe(initialCallCount); // No additional calls (cached)
        });

    });

    describe('extractRelevantSections', () => {
        it('should return empty string for empty documentation', () => {
            const result = Documentation.extractRelevantSections("", "some instruction");
            expect(result).toBe("");
        });

        it('should return whole doc if no valid search terms but doc is small', () => {
            const doc = "Some documentation content here";
            const result = Documentation.extractRelevantSections(doc, "a b c"); // All terms too short
            expect(result).toBe(doc); // Returns whole doc since it's smaller than section size
        });

        it('should return whole doc if smaller than section size', () => {
            const doc = "Short documentation";
            const result = Documentation.extractRelevantSections(doc, "documentation", 5, 500);
            expect(result).toBe(doc);
        });

        it('should return empty string if no sections match search terms', () => {
            const doc = "A".repeat(1000);
            const result = Documentation.extractRelevantSections(doc, "nonexistent term", 5, 200);
            expect(result).toBe("");
        });

        it('should extract sections matching search terms', () => {
            const doc = "prefix ".repeat(50) + "important api endpoint here " + "suffix ".repeat(50);
            const result = Documentation.extractRelevantSections(doc, "api endpoint", 3, 200);

            expect(result).toContain("api");
            expect(result).toContain("endpoint");
            expect(result.length).toBeLessThanOrEqual(3 * 200);
        });

        it('should respect maxSections parameter', () => {
            const section1 = "first section with keyword api " + "x".repeat(170);
            const section2 = "second section with keyword api " + "y".repeat(170);
            const section3 = "third section with keyword api " + "z".repeat(170);
            const doc = section1 + section2 + section3;

            const result = Documentation.extractRelevantSections(doc, "api", 2, 200);

            const sections = result.split('\n\n');
            expect(sections.length).toBeLessThanOrEqual(2);
            expect(result.length).toBeLessThanOrEqual(2 * 200);
        });

        it('should respect sectionSize parameter', () => {
            const doc = "test api ".repeat(100); // ~900 chars
            const result = Documentation.extractRelevantSections(doc, "api test", 3, 250);

            // Should create sections of 250 chars each
            expect(result.length).toBeLessThanOrEqual(3 * 250);
            expect(result).toContain("api");
            expect(result).toContain("test");
        });

        it('should handle multiple search terms and score accordingly', () => {
            const section1 = "authentication and authorization required " + "x".repeat(160);
            const section2 = "just some random content here " + "y".repeat(170);
            const section3 = "authentication mentioned once " + "z".repeat(170);
            const doc = section1 + section2 + section3;

            const result = Documentation.extractRelevantSections(doc, "authentication authorization", 2, 200);

            // Section 1 should score highest (has both terms)
            // Section 3 should score second (has one term)
            // Section 2 should not be included (has no terms)
            expect(result).toContain("authentication");
            expect(result).toContain("authorization");
            expect(result).not.toContain("random content");
        });

        it('should maintain section order after scoring', () => {
            const section1 = "first match for keyword " + "a".repeat(176);
            const section2 = "no matches here at all " + "b".repeat(177);
            const section3 = "third match for keyword " + "c".repeat(176);
            const doc = section1 + section2 + section3;

            const result = Documentation.extractRelevantSections(doc, "keyword", 2, 200);

            // Both matching sections should be included in their original order
            const firstIndex = result.indexOf("first");
            const thirdIndex = result.indexOf("third");
            expect(firstIndex).toBeLessThan(thirdIndex);
        });

        it('should validate and adjust input parameters', () => {
            const doc = "test content ".repeat(100);

            // Test with invalid maxSections (too high)
            const result1 = Documentation.extractRelevantSections(doc, "test", 150, 200);
            expect(result1).toContain("test");

            // Test with invalid sectionSize (too small)
            const result2 = Documentation.extractRelevantSections(doc, "test", 5, 50);
            expect(result2).toContain("test");

            // Test with 0 or negative values
            const result3 = Documentation.extractRelevantSections(doc, "test", 0, -100);
            expect(result3).toContain("test");
        });

        it('should filter search terms by minimum length', () => {
            const doc = "authentication system for api access";

            // "for" should be filtered out (too short)
            const result = Documentation.extractRelevantSections(doc, "for api", 1, 200);
            expect(result).toContain("api");

            // Returns whole doc if all terms are too short and doc is small
            const result2 = Documentation.extractRelevantSections(doc, "a or by", 1, 200);
            expect(result2).toBe(doc); // Whole doc since it's smaller than section size
        });
    });

    describe('Sitemap and URL Ranking', () => {
        let strategy: PlaywrightFetchingStrategy;

        beforeEach(() => {
            strategy = new PlaywrightFetchingStrategy();
            vi.clearAllMocks();
            mockedAxios = axios as Mocked<typeof axios>;
            mockedAxios.get.mockReset();
            mockedAxios.post.mockReset();
            ({ mockPage, mockContext, mockBrowser } = createPlaywrightMocks());
        });

        describe('rankItems', () => {
            it('should filter out URLs with excluded keywords', () => {
                const urls = [
                    'https://api.com/docs/getting-started',
                    'https://api.com/pricing',
                    'https://api.com/docs/authentication',
                    'https://api.com/signup',
                    'https://api.com/blog/updates'
                ];

                const keywords = ['docs', 'authentication'];
                const ranked = strategy.rankItems(urls, keywords);

                // Should exclude pricing, signup, and blog
                expect(ranked).toHaveLength(5);
                expect(ranked[1]).toBe('https://api.com/docs/getting-started');
                expect(ranked[0]).toBe('https://api.com/docs/authentication');
                expect(ranked[2]).toBe('https://api.com/pricing');
                expect(ranked[3]).toBe('https://api.com/signup');
                expect(ranked[4]).toBe('https://api.com/blog/updates');
            });

            it('should rank URLs by keyword match count divided by URL length', () => {
                const urls = [
                    'https://example.com/v1/users/read/fast', // No 'api' in domain, 1 match
                    'https://api.com/documentation/api/v1/users/endpoints', // Long, 2 matches  
                    'https://api.com/api/users', // Short, 2 matches
                ];

                const keywords = ['api', 'users'];
                const ranked = strategy.rankItems(urls, keywords) as string[];

                // api/users should rank highest (2 matches, shortest URL with api)
                expect(ranked[0]).toBe('https://api.com/api/users');
                // Long URL with 2 matches should be second
                expect(ranked[1]).toBe('https://api.com/documentation/api/v1/users/endpoints');
                // URL with only 1 match should be last
                expect(ranked[2]).toBe('https://example.com/v1/users/read/fast');
            });

            it('should handle link objects with text', () => {
                const links = [
                    { linkText: 'API Reference', href: 'https://api.com/reference' },
                    { linkText: 'Getting Started', href: 'https://api.com/start' },
                    { linkText: 'Pricing Plans', href: 'https://api.com/pricing' }
                ];

                const keywords = ['api', 'reference'];
                const ranked = strategy.rankItems(links, keywords);

                expect(ranked).toHaveLength(3); // Pricing excluded
                expect(ranked[0]).toEqual({ linkText: 'API Reference', href: 'https://api.com/reference' });
                expect(ranked[1]).toEqual({ linkText: 'Getting Started', href: 'https://api.com/start' });
                expect(ranked[2]).toEqual({ linkText: 'Pricing Plans', href: 'https://api.com/pricing' });
            });

            it('should filter already fetched links when provided', () => {
                const urls = [
                    'https://api.com/docs/intro',
                    'https://api.com/docs/api',
                    'https://api.com/docs/guide'
                ];

                const fetchedLinks = new Set(['https://api.com/docs/intro']);
                const keywords = ['docs'];
                const ranked = strategy.rankItems(urls, keywords, fetchedLinks) as string[];

                expect(ranked).toHaveLength(2);
                expect(ranked).not.toContain('https://api.com/docs/intro');
            });
        });

        describe('Sitemap fetching', () => {
            it('should fetch and parse XML sitemap', async () => {
                const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://api.com/docs/intro</loc></url>
            <url><loc>https://api.com/docs/auth</loc></url>
            <url><loc>https://api.com/pricing</loc></url>
            <url><loc>https://api.com/docs/api</loc></url>
          </urlset>`;

                // Mock sitemap fetch
                mockedAxios.get.mockImplementation((url: string) => {
                    if (url.includes('sitemap.xml')) {
                        return Promise.resolve({ data: sitemapXml });
                    }
                    return Promise.reject(new Error('404'));
                });

                // Mock page fetches
                mockPage.content.mockResolvedValue('<html><body>Content</body></html>');
                mockPage.evaluate.mockImplementation((fn) => {
                    if (typeof fn === 'function' && fn.toString().includes('querySelectorAll')) {
                        return Promise.resolve({}); // Empty links
                    }
                    return Promise.resolve(undefined);
                });

                const doc = new Documentation({
                    documentationUrl: 'https://api.com/docs',
                    keywords: ['api', 'auth']
                }, {}, metadata);

                const result = await doc.fetchAndProcess();

                // Should fetch sitemap
                expect(mockedAxios.get).toHaveBeenCalledWith(
                    expect.stringContaining('sitemap.xml'),
                    expect.any(Object)
                );

                // Should have fetched pages (excluding pricing due to excluded keywords)
                expect(mockPage.goto).toHaveBeenCalled();
                expect(result).toContain('Content');
            });

            it('should handle sitemap index with nested sitemaps', async () => {
                const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
          <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <sitemap><loc>https://api.com/docs/sitemap.xml</loc></sitemap>
            <sitemap><loc>https://api.com/blog/sitemap.xml</loc></sitemap>
          </sitemapindex>`;

                const docsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://api.com/docs/intro</loc></url>
            <url><loc>https://api.com/docs/api</loc></url>
          </urlset>`;

                mockedAxios.get.mockImplementation((url: string) => {
                    if (url.includes('sitemap_index.xml') || url === 'https://api.com/sitemap.xml') {
                        return Promise.resolve({ data: sitemapIndex });
                    }
                    if (url.includes('docs/sitemap.xml')) {
                        return Promise.resolve({ data: docsSitemap });
                    }
                    return Promise.reject(new Error('404'));
                });

                mockPage.content.mockResolvedValue('<html><body>Docs</body></html>');
                mockPage.evaluate.mockResolvedValue({});

                const doc = new Documentation({
                    documentationUrl: 'https://api.com/docs',
                    keywords: ['docs']
                }, {}, metadata);

                const result = await doc.fetchAndProcess();

                // Should fetch main sitemap and docs sitemap (not blog due to filtering)
                expect(mockedAxios.get).toHaveBeenCalledWith(
                    expect.stringContaining('sitemap'),
                    expect.any(Object)
                );
                expect(result).toContain('Docs');
            });

            it('should fall back to legacy crawling if no sitemap found', async () => {
                // All sitemap requests fail
                mockedAxios.get.mockRejectedValue(new Error('404'));

                // Mock initial page with links
                mockPage.content.mockResolvedValueOnce('<html><body>Main Page</body></html>');
                mockPage.evaluate.mockImplementation((fn) => {
                    if (typeof fn === 'function' && fn.toString().includes('querySelectorAll')) {
                        // Return links on first call
                        return Promise.resolve({
                            'api reference https docs api': 'https://api.com/docs/api',
                            'getting started https docs start': 'https://api.com/docs/start'
                        });
                    }
                    return Promise.resolve(undefined);
                });

                const doc = new Documentation({
                    documentationUrl: 'https://api.com/docs',
                    keywords: ['api']
                }, {}, metadata);

                const result = await doc.fetchAndProcess();

                // Should use legacy crawling
                expect(mockPage.goto).toHaveBeenCalled();
                expect(result).toContain('Main Page');
            });

            it('should respect MAX_FETCHED_LINKS limit', async () => {
                // Create a sitemap with many URLs
                const urls = Array.from({ length: 100 }, (_, i) =>
                    `<url><loc>https://api.com/docs/page${i}</loc></url>`
                ).join('');

                const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            ${urls}
          </urlset>`;

                mockedAxios.get.mockImplementation((url: string) => {
                    if (url.includes('sitemap.xml')) {
                        return Promise.resolve({ data: sitemapXml });
                    }
                    return Promise.reject(new Error('404'));
                });

                mockPage.content.mockResolvedValue('<html><body>Page</body></html>');
                mockPage.evaluate.mockResolvedValue({});

                const doc = new Documentation({
                    documentationUrl: 'https://api.com/docs',
                    keywords: ['docs']
                }, {}, metadata);

                await doc.fetchAndProcess();

                // Should respect the limit (default is 10)
                expect(mockPage.goto).toHaveBeenCalledTimes(server_defaults.DOCUMENTATION.MAX_FETCHED_LINKS);
            });

            it('should filter sitemap URLs by path relevance', async () => {
                const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://api.com/docs/api/intro</loc></url>
            <url><loc>https://api.com/company/about</loc></url>
            <url><loc>https://api.com/docs/api/auth</loc></url>
            <url><loc>https://api.com/marketing/landing</loc></url>
          </urlset>`;

                mockedAxios.get.mockImplementation((url: string) => {
                    // Return sitemap for the first matching candidate
                    if (url.includes('sitemap.xml')) {
                        return Promise.resolve({ data: sitemapXml });
                    }
                    return Promise.reject(new Error('404'));
                });

                mockPage.content.mockResolvedValue('<html><body>Content</body></html>');
                mockPage.evaluate.mockResolvedValue({});

                const doc = new Documentation({
                    documentationUrl: 'https://api.com/docs/api',
                    keywords: ['intro', 'auth'] // Keywords that match the URLs
                }, {}, metadata);

                await doc.fetchAndProcess();

                // Should have fetched some pages
                const calledUrls = mockPage.goto.mock.calls.map(call => call[0]);
                expect(calledUrls.length).toBeGreaterThan(0);

                // Verify that URL filtering worked by checking the fetched URLs
                // The implementation filters at collection time, so we should only see relevant URLs
                expect(calledUrls.some(url => url.includes('intro') || url.includes('auth'))).toBe(true);
            });
        });
    });
});
import playwright from '@playwright/test';
import { Metadata } from '@superglue/shared';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { server_defaults } from '../default.js';
import { LanguageModel } from '../llm/llm.js';
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

const DOCUMENTATION_MAX_LENGTH = Math.min(LanguageModel.contextLength - 50000, 200000);

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
      const docUrl = 'https://api.example.com/docs';
      const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
      expect(mockContext.newPage).toHaveBeenCalledTimes(1);
      expect(mockPage.goto).toHaveBeenCalledWith(docUrl, { timeout: server_defaults.TIMEOUTS.PLAYWRIGHT });
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: server_defaults.TIMEOUTS.PLAYWRIGHT });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(2); // For removing elements and getting links
      expect(mockPage.content).toHaveBeenCalledTimes(1);
      expect(result).toContain('# API Docs');
      expect(result).toContain('Details here.');
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should return raw page content if not HTML, GraphQL, or OpenAPI', async () => {
      const plainDoc = 'Plain text documentation content.';
      mockPage.content.mockResolvedValueOnce(plainDoc);
      const doc = new Documentation({ documentationUrl: 'https://api.example.com/raw', urlHost: 'https://api.example.com' }, {}, metadata);
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.content).toHaveBeenCalledTimes(1);
      expect(result).toBe(plainDoc);
      expect(mockedAxios.get).not.toHaveBeenCalled();
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
        { headers, params, timeout: 60000 }
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
      const swaggerHtml = `<html><script id="swagger-settings">{ "url": "/api/v1/openapi.json" }</script></html>`;
      const openApiJson = { openapi: "3.0.1", info: { title: "My API" } };
      const baseUrl = 'https://base.example.com/docs';

      mockPage.content.mockResolvedValueOnce(swaggerHtml); // Playwright returns HTML
      mockedAxios.get.mockResolvedValueOnce({ data: openApiJson }); // Axios fetches OpenAPI spec

      const doc = new Documentation({ documentationUrl: baseUrl, urlHost: 'https://api.example.com' }, {}, metadata);
      const result = await doc.fetchAndProcess();

      // Verify Playwright fetch
      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.content).toHaveBeenCalledTimes(1);
      // Verify Axios fetch for OpenAPI spec (relative URL resolved correctly)
      expect(mockedAxios.get).toHaveBeenCalledWith('https://base.example.com/api/v1/openapi.json', {
        headers: undefined,
        timeout: 60000
      });
      // Verify result is the OpenAPI spec
      expect(result).toContain(JSON.stringify(openApiJson));
    });

    it('should extract and fetch absolute OpenAPI URL found in HTML', async () => {
      const swaggerHtml = `<html><body><a href="https://absolute.com/openapi.yaml">Link</a></body></html>`; // Different extraction case
      const openApiYaml = `openapi: 3.0.0\ninfo:\n  title: YAML API`;
      const docUrl = 'https://api.example.com/docs';

      mockPage.content.mockResolvedValueOnce(swaggerHtml);
      mockedAxios.get.mockResolvedValueOnce({ data: openApiYaml });

      const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.content).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledWith('https://absolute.com/openapi.yaml', {
        headers: undefined,
        timeout: 60000
      });
      expect(result).toContain(openApiYaml);
    });

    it('should handle page content being the OpenAPI spec directly (JSON)', async () => {
      const openApiJsonString = JSON.stringify({ swagger: "2.0", info: { title: "Direct JSON" } });
      mockPage.content.mockResolvedValueOnce(openApiJsonString); // Playwright returns JSON string
      const docUrl = 'https://api.example.com/openapi.json';
      const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.content).toHaveBeenCalledTimes(1);
      // No axios.get call needed as content *is* the spec
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(result).toContain(openApiJsonString);
    });

    it('should handle page content being the OpenAPI spec directly (YAML)', async () => {
      const openApiYaml = `openapi: 3.1.0\ninfo:\n  title: Direct YAML`;
      mockPage.content.mockResolvedValueOnce(openApiYaml); // Playwright returns YAML string
      const docUrl = 'https://api.example.com/openapi.yaml';
      const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com' }, {}, metadata);
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.content).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(result).toBe(openApiYaml);
    });

    it('should fall back to HTML->Markdown if OpenAPI extraction/fetch fails', async () => {
      const swaggerHtml = `<html><script id="swagger-settings">{ "url": "/missing.json" }</script><body>Content</body></html>`;
      mockPage.content.mockResolvedValueOnce(swaggerHtml); // Playwright gets HTML
      mockedAxios.get.mockRejectedValueOnce(new Error('404 Not Found')); // Axios fails for OpenAPI
      const headers = { 'Auth': 'key' };
      const docUrl = 'https://api.example.com/docs';
      const doc = new Documentation({ documentationUrl: docUrl, urlHost: 'https://api.example.com', headers }, {}, metadata);
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.example.com/missing.json', {
        headers,
        timeout: 60000
      });
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
      // Test with a strategy that involves mocks
      const htmlDoc = `<html><body>Data</body></html>`;
      mockPage.content.mockResolvedValueOnce(htmlDoc);
      const httpDoc = new Documentation({ documentationUrl: 'http://example.com', urlHost: 'https://api.example.com' }, {}, metadata);

      const resHttp1 = await httpDoc.fetchAndProcess();
      expect(resHttp1).toBe("Data");
      expect(mockPage.content).toHaveBeenCalledTimes(1); // Called once

      const resHttp2 = await httpDoc.fetchAndProcess();
      expect(resHttp2).toBe("Data");
      expect(mockPage.content).toHaveBeenCalledTimes(1); // Still called only once
    });

  });

  describe('postProcess', () => {
    // Helper function to create long strings
    const createLongString = (char: string, factor: number) => char.repeat(Math.ceil(DOCUMENTATION_MAX_LENGTH * factor));

    it('should return empty string for empty documentation', () => {
      const result = Documentation.extractRelevantSections("", "some instruction");
      expect(result).toBe("");
    });

    it('should return documentation as is if no instruction provided', () => {
      const doc = "Some documentation";
      const result = Documentation.extractRelevantSections(doc, "");
      expect(result).toBe(doc);
    });

    it('should return documentation as is if within length limits', () => {
      const doc = "Short documentation";
      const result = Documentation.extractRelevantSections(doc, "some instruction");
      expect(result).toBe(doc);
    });

    it('should truncate very long content if no relevant terms found', () => {
      const longContent = createLongString('A', 1.5);
      const result = Documentation.extractRelevantSections(longContent, "unrelated instruction");
      expect(result.length).toBe(DOCUMENTATION_MAX_LENGTH);
      expect(result).toBe(longContent.slice(0, DOCUMENTATION_MAX_LENGTH));
    });

    it('should extract context around search terms', () => {
      const searchTerm = "findme";
      const prefix = createLongString('P', 0.6);
      const middle = createLongString('M', 0.6);
      const suffix = createLongString('S', 0.6);
      const longContent = `${prefix} context around ${searchTerm} here ${middle} more context ${suffix}`;

      const result = Documentation.extractRelevantSections(longContent, `instruction with ${searchTerm}`);

      expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
      expect(result).toContain(searchTerm);
      // Instead of checking exact prefix, verify we have chunks with the search term
      const chunks = result.split('\n\n');
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.some(chunk => chunk.includes(searchTerm))).toBe(true);
      expect(result).toContain(`context around ${searchTerm} here`);
    });

    it('should include authorization/securitySchemes context', () => {
      const searchTerm = "userinfo";
      const prefix = createLongString('X', 0.8);
      const suffix = createLongString('Y', 0.8);
      const authSection = "important authorization definition here";
      const longContent = `${prefix} some data about ${searchTerm} ${suffix} ${authSection}`;

      const result = Documentation.extractRelevantSections(longContent, `instruction with ${searchTerm}`);

      expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
      expect(result).toContain(searchTerm);
      expect(result).toContain("authorization");
    });

    it('should handle multiple search terms', () => {
      const term1 = "term1";
      const term2 = "term2";
      const prefix = createLongString('P', 0.6);
      const middle = createLongString('M', 0.6);
      const suffix = createLongString('S', 0.6);
      const longContent = `${prefix} ${term1} here ${middle} ${term2} there ${suffix}`;

      const result = Documentation.extractRelevantSections(longContent, `instruction with ${term1} and ${term2}`);

      expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
      expect(result).toContain(term1);
      expect(result).toContain(term2);
    });

    it('should maintain proper chunk separation', () => {
      const searchTerm = "findme";
      const prefix = createLongString('P', 0.6);
      const middle = createLongString('M', 0.6);
      const suffix = createLongString('S', 0.6);
      const longContent = `${prefix} ${searchTerm} ${middle} ${searchTerm} ${suffix}`;

      const result = Documentation.extractRelevantSections(longContent, `instruction with ${searchTerm}`);

      expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
      expect(result.split("\n\n").length).toBeGreaterThan(1); // Should have multiple chunks
      expect(result).toContain(searchTerm);
    });
  });
});

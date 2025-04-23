import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import playwright from '@playwright/test';
import axios from 'axios';
import { getDocumentation, postProcessLargeDoc, closeBrowser } from './documentation.js';
import { LanguageModel } from '../llm/llm.js';

// Mock playwright and axios
vi.mock('@playwright/test', () => ({
  default: {
    chromium: {
      launch: vi.fn(),
    },
  },
}));

vi.mock('axios');

const DOCUMENTATION_MAX_LENGTH = Math.min(LanguageModel.contextLength - 50000, 200000);

describe('Documentation Utilities', () => {
  let mockPage: any;
  let mockContext: any;
  let mockBrowser: any;
  let mockedAxios: any;
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue(''),
      evaluate: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockedAxios = axios as Mocked<typeof axios>;

    // Setup the browser launch mock
    vi.mocked(playwright.chromium.launch).mockResolvedValue(mockBrowser);

    // Add axios mock reset
    vi.mocked(axios.get).mockReset();
  });

  afterEach(async () => {
    await closeBrowser();
  });
  
    describe('getDocumentation', () => {
      it('should return empty string for empty documentation URL', async () => {
        const result = await getDocumentation('', {}, {});
        expect(result).toBe('');
      });
  
      it('should fetch and convert HTML documentation', async () => {
        const htmlDoc = `
          <html>
            <body>
              <h1>API Documentation</h1>
              <p>This is a test documentation.</p>
            </body>
          </html>
        `;
        
        mockPage.content.mockResolvedValueOnce(htmlDoc);
        
        const result = await getDocumentation('https://api.example.com/docs', {}, {});
        
        expect(mockPage.goto).toHaveBeenCalledWith('https://api.example.com/docs');
        expect(result).toContain('# API Documentation');
        expect(result).toContain('This is a test documentation.');
      });
  
      it('should handle non-HTML documentation', async () => {
        const plainDoc = 'Plain text documentation';
        mockPage.content.mockResolvedValueOnce(plainDoc);
        
        const result = await getDocumentation('https://api.example.com/docs', {}, {});
        
        expect(result).toBe('Plain text documentation');
      });
  
      it('should fetch GraphQL schema for GraphQL endpoints', async () => {
        const mockSchema = {
          __schema: {
            types: [
              { name: 'Query', fields: [] }
            ]
          }
        };
  
        mockPage.content.mockResolvedValueOnce('GraphQL API Documentation');
        mockedAxios.post.mockResolvedValueOnce({ 
          data: { data: mockSchema }
        });
  
        const result = await getDocumentation(
          'https://api.example.com/graphql',
          { 'Authorization': 'Bearer token' },
          { 'version': '1' }
        );
  
        // Verify both documentation and schema were fetched
        expect(mockPage.goto).toHaveBeenCalledWith('https://api.example.com/graphql?version=1');
        expect(mockedAxios.post).toHaveBeenCalledWith(
          'https://api.example.com/graphql',
          expect.objectContaining({
            query: expect.any(String),
            operationName: 'IntrospectionQuery'
          }),
          expect.objectContaining({
            headers: { 'Authorization': 'Bearer token' },
            params: { 'version': '1' }
          })
        );
        expect(result).toContain(JSON.stringify(mockSchema.__schema));
      });
  
      it('should handle GraphQL schema fetch errors gracefully', async () => {
        const plainDoc = 'GraphQL API Documentation';
        mockPage.content.mockResolvedValueOnce(plainDoc);
        mockedAxios.post.mockRejectedValueOnce(new Error('GraphQL Error'));
  
        const result = await getDocumentation('https://api.example.com/graphql', {}, {});
  
        expect(result).toBe(plainDoc);
      });
  
      it('should handle GraphQL schema errors in response', async () => {
        const plainDoc = 'GraphQL API Documentation';
        mockedAxios.get.mockResolvedValueOnce({ data: plainDoc });
        mockPage.content.mockResolvedValueOnce(plainDoc);
        mockedAxios.post.mockResolvedValueOnce({ 
          data: { 
            errors: [{ message: 'Invalid introspection query' }]
          }
        });
  
        const result = await getDocumentation('https://api.example.com/graphql', {}, {});
  
        expect(result).toBe(plainDoc);
      });
  
      it('should handle documentation fetch errors gracefully', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));
  
        const result = await getDocumentation('https://api.example.com/docs', {}, {});
  
        expect(result).toBe('');
      });
  
      it('should detect GraphQL endpoints from documentation content', async () => {
        const docWithGraphQL = 'This is a GraphQL API endpoint';
        const mockSchema = {
          __schema: {
            types: [
              { name: 'Query', fields: [] }
            ]
          }
        };
        
        mockPage.content.mockResolvedValueOnce(docWithGraphQL);
        mockedAxios.get.mockResolvedValueOnce({ data: docWithGraphQL });
        mockedAxios.post.mockResolvedValueOnce({ 
          data: { data: mockSchema }
        });
  
        const result = await getDocumentation(
          'https://api.example.com/docs',
          {},
          {}
        );
  
        expect(mockedAxios.post).toHaveBeenCalled();
        expect(result).toContain(docWithGraphQL);
        expect(result).toContain(JSON.stringify(mockSchema.__schema));
      });
  
      it('should handle complex HTML with special characters and nested elements', async () => {
        const complexHtmlDoc = `
          <!DOCTYPE html>
          <html class="documentation">
            <body>
              <div class="wrapper">
                <h1>Complex &amp; Special Doc</h1>
                <div class="nested">
                  <ul>
                    <li>Item with <strong>bold</strong> and <em>italic</em></li>
                    <li>Item with <code>inline code &lt;tags&gt;</code></li>
                  </ul>
                  <script>
                    function test() {
                      // Some code block
                      return true;
                    }
                  </script>
                  <table>
                    <tr>
                      <td>Cell 1 &copy;</td>
                      <td>Cell 2 &reg;</td>
                    </tr>
                  </table>
                </div>
              </div>
            </body>
          </html>
        `;
        
        mockPage.content.mockResolvedValueOnce(complexHtmlDoc);
        
        const result = await getDocumentation('https://api.example.com/docs', {}, {});
        
        expect(result).toContain('# Complex & Special Doc');
        expect(result).toContain('Item with **bold** and _italic_');
        expect(result).toContain('`inline code <tags>`');
        expect(result).toContain('| Cell 1 © | Cell 2 ® |');
      });
  
      it('should extract and fetch OpenAPI JSON URL from Swagger UI HTML', async () => {
        const swaggerHtml = `
          <!DOCTYPE html>
          <html>
          <head>
              <link type="text/css" rel="stylesheet" href="/static/ninja/swagger-ui.c9a0b360b746.css">
              <link rel="shortcut icon" href="/static/ninja/favicon.8d5ab72e19e7.png">
              <title>Ento API</title>
          </head>
          <body
              data-csrf-token=""
              data-api-csrf="">
          
              <script type="application/json" id="swagger-settings">
                  {
           "layout": "BaseLayout",
           "deepLinking": true,
           "url": "/api/v1/openapi.json"
          }
              </script>
              
              <div id="swagger-ui"></div>
          
              <script src="/static/ninja/swagger-ui-bundle.ca90216c3f6d.js"></script>
              <script src="/static/ninja/swagger-ui-init.ec666b6c27d3.js"></script>
          
          </body>
          </html>
        `;
        
        const openApiJson = {
          openapi: "3.0.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {}
        };
        
        // Mock first response to return the Swagger HTML
        mockPage.goto.mockImplementationOnce(url => {
          if (url === 'https://api.example.com/docs') {
            return Promise.resolve({ data: swaggerHtml });
          }
          return Promise.reject(new Error('URL not mocked'));
        });
        mockPage.content.mockResolvedValueOnce(swaggerHtml);

        // Mock second response to return the OpenAPI JSON
        mockedAxios.get.mockImplementationOnce(url => {
          if (url === 'https://api.example.com/api/v1/openapi.json') {
            return Promise.resolve({ data: openApiJson });
          }
          return Promise.reject(new Error('URL not mocked'));
        });
        
        const result = await getDocumentation('https://api.example.com/docs', {}, {});
        
        // Verify both calls were made
        expect(mockPage.goto).toHaveBeenCalledWith('https://api.example.com/docs');
        expect(mockedAxios.get).toHaveBeenCalledWith('https://api.example.com/api/v1/openapi.json');
        
        // Verify the result contains the OpenAPI JSON
        expect(result).toContain(JSON.stringify(openApiJson));
      });
      
      it('should handle OpenAPI URL that is absolute', async () => {
        // More complete HTML example for better matching
        const swaggerHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>API Documentation</title>
          </head>
          <body>
            <div id="swagger-ui"></div>
            <script type="application/json" id="swagger-settings">
              {
                "url": "https://external-api.com/openapi.json"
              }
            </script>
          </body>
          </html>
        `;
        
        const openApiJson = { openapi: "3.0.0" };
        
        mockPage.content.mockResolvedValueOnce(swaggerHtml);
        mockedAxios.get.mockResolvedValueOnce({ data: openApiJson });
        
        const result = await getDocumentation('https://api.example.com/docs', {}, {});
        
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
        expect(mockedAxios.get).toHaveBeenCalledWith('https://external-api.com/openapi.json');
        expect(result).toContain(JSON.stringify(openApiJson));
      });
      
      it('should handle OpenAPI extraction errors gracefully', async () => {
        // More complete HTML example for better matching
        const swaggerHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>API Documentation</title>
          </head>
          <body>
            <div id="swagger-ui"></div>
            <script type="application/json" id="swagger-settings">
              {
                "url": "/api/v1/openapi.json"
              }
            </script>
          </body>
          </html>
        `;
        
        mockPage.content.mockResolvedValueOnce(swaggerHtml);
        mockedAxios.get.mockRejectedValueOnce(new Error('Failed to fetch OpenAPI'));
        
        const result = await getDocumentation('https://api.example.com/docs', {}, {});
        
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
        // Result should still contain parts of the original HTML converted to markdown
        expect(result).toContain('DOCTYPE');
        expect(result).toContain('html');
      });
    });
  
    describe('postProcessLargeDoc', () => {
      it('should handle undefined endpoint without infinite loops', () => {
        // Create a documentation string longer than MAX_DOC_LENGTH
        const repeatLenght = DOCUMENTATION_MAX_LENGTH * 2;
        const longDocumentation = 'A'.repeat(repeatLenght);
        
        // Call with undefined endpoint
        const result = postProcessLargeDoc(longDocumentation, undefined);
        
        // Should return a truncated version of the documentation
        expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
        expect(result).toBe(longDocumentation.slice(0, DOCUMENTATION_MAX_LENGTH));
      });
      
      it('should handle null endpoint without infinite loops', () => {
        // Create a documentation string longer than MAX_DOC_LENGTH
        const repeatLenght = DOCUMENTATION_MAX_LENGTH * 2;
        const longDocumentation = 'A'.repeat(repeatLenght);
        
        // Call with null endpoint
        const result = postProcessLargeDoc(longDocumentation, null);
        
        // Should return a truncated version of the documentation
        expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
        expect(result).toBe(longDocumentation.slice(0, DOCUMENTATION_MAX_LENGTH));
      });
      
      it('should handle empty string endpoint without infinite loops', () => {
        // Create a documentation string longer than MAX_DOC_LENGTH
        const repeatLenght = DOCUMENTATION_MAX_LENGTH * 2;
        const longDocumentation = 'A'.repeat(repeatLenght);
        
        // Call with empty string endpoint
        const result = postProcessLargeDoc(longDocumentation, '');
        
        // Should return a truncated version of the documentation
        expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
        expect(result).toBe(longDocumentation.slice(0, DOCUMENTATION_MAX_LENGTH));
      });
  
      it('should handle very short endpoint without infinite loops', () => {
        // Create a documentation string longer than MAX_DOC_LENGTH
        const repeatLenght = DOCUMENTATION_MAX_LENGTH * 2;
        const longDocumentation = 'A'.repeat(repeatLenght) + 'api' + 'A'.repeat(repeatLenght);
        
        // Call with endpoint shorter than minimum search term length (4 chars)
        const result = postProcessLargeDoc(longDocumentation, 'api');
        
        // Should return a truncated version of the documentation (first chunk)
        expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
        // In this case, it should still find the search term
        expect(result).toContain('api');
      });
      it('should include regions around multiple occurrences of search term', () => {
        // Create a documentation string with multiple occurrences of the search term
        const repeatLenght = DOCUMENTATION_MAX_LENGTH * 1.8 / 3;
        const prefix = 'ABC'.repeat(repeatLenght);
        const middle = 'BKJ'.repeat(repeatLenght);
        const suffix = 'CDE'.repeat(repeatLenght);
        const suffixShort = 'FGH'.repeat(100);
        
        // Insert search term at different positions
        const searchTerm = 'userProfile';
        const docTerms = [
          `Here is info about ${searchTerm}`,
          `More details about ${searchTerm} endpoint`,
          `Overlapping details about ${searchTerm} endpoint `
        ];
        const longDocumentation = 
          prefix + 
          docTerms[0] + 
          middle + 
          docTerms[1] + 
          suffixShort +
          docTerms[2] +
          suffix;
        
        // Call with the search term as endpoint
        const result = postProcessLargeDoc(longDocumentation, '/userProfile');
        
        // Should return a document within the max length
        expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
        
        // Should contain context from both regions
        expect(result).toContain(docTerms[0]);
        expect(result).toContain(docTerms[1]);
        expect(result).toContain(docTerms[2]);
      });
  
      it('it should include the authorization, even if its the last thing found', () => {
        // Create a documentation string with multiple occurrences of the search term
        const repeatLenght = DOCUMENTATION_MAX_LENGTH * 1.8 / 3;
        const prefix = 'ABC'.repeat(repeatLenght);
        const middle = 'BKJ'.repeat(repeatLenght);
        const suffix = 'CDE'.repeat(repeatLenght);
        const suffixShort = 'FGH'.repeat(100);
        
        // Insert search term at different positions
        const searchTerm = 'userProfile';
        const docTerms = [
          `Here is info about ${searchTerm}`,
          `More details about ${searchTerm} endpoint`,
          `details about authorization`
        ];
        const longDocumentation = 
          prefix + 
          docTerms[0] + 
          middle + 
          docTerms[1] + 
          suffix +
          docTerms[2] +
          suffixShort;
        
        // Call with the search term as endpoint
        const result = postProcessLargeDoc(longDocumentation, '/userProfile');
        
        // Should return a document within the max length
        expect(result.length).toBeLessThanOrEqual(DOCUMENTATION_MAX_LENGTH);
        
        // Should contain context from both regions
        expect(result).toContain(docTerms[0]);
        expect(result).toContain(docTerms[1]);
        expect(result).toContain(docTerms[2]);
      });
    });
  });

import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { getDocumentation, postProcessLargeDoc } from './documentation.js';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

describe('Documentation Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
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
      
      mockedAxios.get.mockResolvedValueOnce({ data: htmlDoc });
      
      const result = await getDocumentation('https://api.example.com/docs', {}, {});
      
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.example.com/docs');
      expect(result).toContain('# API Documentation');
      expect(result).toContain('This is a test documentation.');
    });

    it('should handle non-HTML documentation', async () => {
      const plainDoc = 'Plain text documentation';
      mockedAxios.get.mockResolvedValueOnce({ data: plainDoc });
      
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

      mockedAxios.get.mockResolvedValueOnce({ data: 'GraphQL API Documentation' });
      mockedAxios.post.mockResolvedValueOnce({ 
        data: { data: mockSchema }
      });

      const result = await getDocumentation(
        'https://api.example.com/graphql',
        { 'Authorization': 'Bearer token' },
        { 'version': '1' }
      );

      // Verify both documentation and schema were fetched
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.example.com/graphql');
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
      mockedAxios.get.mockResolvedValueOnce({ data: plainDoc });
      mockedAxios.post.mockRejectedValueOnce(new Error('GraphQL Error'));

      const result = await getDocumentation('https://api.example.com/graphql', {}, {});

      expect(result).toBe(plainDoc);
    });

    it('should handle GraphQL schema errors in response', async () => {
      const plainDoc = 'GraphQL API Documentation';
      mockedAxios.get.mockResolvedValueOnce({ data: plainDoc });
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
      
      mockedAxios.get.mockResolvedValueOnce({ data: complexHtmlDoc });
      
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
      mockedAxios.get.mockImplementationOnce(url => {
        if (url === 'https://api.example.com/docs') {
          return Promise.resolve({ data: swaggerHtml });
        }
        return Promise.reject(new Error('URL not mocked'));
      });
      
      // Mock second response to return the OpenAPI JSON
      mockedAxios.get.mockImplementationOnce(url => {
        if (url === 'https://api.example.com/api/v1/openapi.json') {
          return Promise.resolve({ data: openApiJson });
        }
        return Promise.reject(new Error('URL not mocked'));
      });
      
      const result = await getDocumentation('https://api.example.com/docs', {}, {});
      
      // Verify both calls were made
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get).toHaveBeenNthCalledWith(1, 'https://api.example.com/docs');
      expect(mockedAxios.get).toHaveBeenNthCalledWith(2, 'https://api.example.com/api/v1/openapi.json');
      
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
      
      mockedAxios.get.mockResolvedValueOnce({ data: swaggerHtml });
      mockedAxios.get.mockResolvedValueOnce({ data: openApiJson });
      
      const result = await getDocumentation('https://api.example.com/docs', {}, {});
      
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get).toHaveBeenNthCalledWith(2, 'https://external-api.com/openapi.json');
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
      
      mockedAxios.get.mockResolvedValueOnce({ data: swaggerHtml });
      mockedAxios.get.mockRejectedValueOnce(new Error('Failed to fetch OpenAPI'));
      
      const result = await getDocumentation('https://api.example.com/docs', {}, {});
      
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      // Result should still contain parts of the original HTML converted to markdown
      expect(result).toContain('DOCTYPE');
      expect(result).toContain('html');
    });
  });

  describe('postProcessLargeDoc', () => {
    it('should handle undefined endpoint without infinite loops', () => {
      // Create a documentation string longer than MAX_DOC_LENGTH
      const longDocumentation = 'A'.repeat(100000);
      
      // Call with undefined endpoint
      const result = postProcessLargeDoc(longDocumentation, undefined);
      
      // Should return a truncated version of the documentation
      expect(result.length).toBeLessThanOrEqual(80000);
      expect(result).toBe(longDocumentation.slice(0, 80000));
    });
    
    it('should handle null endpoint without infinite loops', () => {
      // Create a documentation string longer than MAX_DOC_LENGTH
      const longDocumentation = 'A'.repeat(100000);
      
      // Call with null endpoint
      const result = postProcessLargeDoc(longDocumentation, null);
      
      // Should return a truncated version of the documentation
      expect(result.length).toBeLessThanOrEqual(80000);
      expect(result).toBe(longDocumentation.slice(0, 80000));
    });
    
    it('should handle empty string endpoint without infinite loops', () => {
      // Create a documentation string longer than MAX_DOC_LENGTH
      const longDocumentation = 'A'.repeat(100000);
      
      // Call with empty string endpoint
      const result = postProcessLargeDoc(longDocumentation, '');
      
      // Should return a truncated version of the documentation
      expect(result.length).toBeLessThanOrEqual(80000);
      expect(result).toBe(longDocumentation.slice(0, 80000));
    });

    it('should handle very short endpoint without infinite loops', () => {
      // Create a documentation string longer than MAX_DOC_LENGTH
      const longDocumentation = 'A'.repeat(100000) + 'api' + 'A'.repeat(10000);
      
      // Call with endpoint shorter than minimum search term length (4 chars)
      const result = postProcessLargeDoc(longDocumentation, 'api');
      
      // Should return a truncated version of the documentation (first chunk)
      expect(result.length).toBeLessThanOrEqual(80000);
      // In this case, it should still find the search term
      expect(result).toContain('api');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach, type Mocked } from 'vitest';
import axios from 'axios';
import { getDocumentation } from './documentation.js';

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
  });
});

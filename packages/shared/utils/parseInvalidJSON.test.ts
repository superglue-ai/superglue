

import { describe, test, expect } from 'vitest';
import { parseRobustJson, parseApiResponse } from './parseInvalidJSON';


const testCases = {

  encodingProblems: {
    doubleEncoded: '"{\"name\":\"john\",\"age\":25}"',
    tripleEncoded: '"\"{\\\"name\\\":\\\"john\\\",\\\"age\\\":25}\""',
    mixedEncoding: "{\"user\": \"{\\\"name\\\":\\\"john\\\"}\", \"count\": 5, \"active\": \"true\"}",
    base64Wrapped: btoa('{"message": "hello world", "status": "success"}'),
  },

  structuralWeirdness: {
    jsonInStrings: '{"data": "{\\"name\\":\\"john\\"}"}',
    stringifiedNumbers: '{"age": "25", "price": "99.99", "count": "0"}',
    arraysAsObjects: '{"0": "first", "1": "second", "2": "third"}',
    nestedArraysAsObjects: '{"items": {"0": {"name": "item1"}, "1": {"name": "item2"}}}',
  },

  characterIssues: {
    escapedUnicode: '{"name": "\\u0041\\u006C\\u0065\\u0078", "symbol": "\\u00A9"}',
    bomPrefix: '\uFEFF{"data": "with BOM prefix"}',
    trailingCommas: '{"name": "john", "age": 25,}',
    trailingCommasArray: '["apple", "banana", "cherry",]',
    mixedQuotes: `{"name": 'john', "city": "new york"}`,
  },

  formatVariations: {
    jsonl: '{"id": 1, "name": "first"}\n{"id": 2, "name": "second"}\n{"id": 3, "name": "third"}',
    json5Comments: `{
      // This is a comment
      "name": "john",
      /* Multi-line
         comment */
      "age": 25,
    }`,
    json5TrailingCommas: '{"items": ["a", "b", "c",], "count": 3,}',
  },

  realWorldExamples: {
    malformedApiResponse: '{"status":"success","data":"{\\"users\\":[{\\"id\\":1,\\"name\\":\\"John\\"}]}","timestamp":"1640995200"}',
    stringifiedApiResponse: '"{\\"results\\":[{\\"title\\":\\"Test\\",\\"count\\":\\"42\\"}],\\"total\\":\\"100\\"}"',
    nestedStringifiedResponse: '{"response": "{\\"data\\": \\"{\\\\\\"items\\\\\\":[{\\\\\\"id\\\\\\":1}]}\\"}"}',
  },

  edgeCases: {
    empty: '',
    whitespace: '   \n\t  ',
    nullString: 'null',
    undefinedString: 'undefined',
    booleanString: 'true',
    numberString: '42',
    validJson: '{"valid": "json", "works": true}',
  }
};

describe('Robust JSON Parser', () => {
  describe('Encoding Problems', () => {
    test('should parse double encoded JSON', () => {
      const result = parseRobustJson(testCases.encodingProblems.doubleEncoded, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'john', age: 25 });
      expect(result.transformations).toContain('parseStringifiedJson');
    });

    test('should parse triple encoded JSON', () => {
      const result = parseRobustJson(testCases.encodingProblems.tripleEncoded, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'john', age: 25 });
      expect(result.transformations?.length).toBeGreaterThan(0);
    });

    test('should parse mixed encoding', () => {
      const result = parseRobustJson(testCases.encodingProblems.mixedEncoding, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('user');
      expect(result.data).toHaveProperty('count', 5);
      expect(result.data).toHaveProperty('active', 'true');
    });

    test('should parse base64 wrapped JSON', () => {
      const result = parseRobustJson(testCases.encodingProblems.base64Wrapped, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'hello world', status: 'success' });
      expect(result.transformations).toContain('parseBase64Json');
    });
  });

  describe('Structural Weirdness', () => {
    test('should parse JSON in strings', () => {
      const result = parseRobustJson(testCases.structuralWeirdness.jsonInStrings);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('data');
    });

    test('should parse stringified numbers', () => {
      const result = parseRobustJson(testCases.structuralWeirdness.stringifiedNumbers);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('age', '25');
      expect(result.data).toHaveProperty('price', '99.99');
      expect(result.data).toHaveProperty('count', '0');
    });

    test('should parse arrays as objects', () => {
      const result = parseRobustJson(testCases.structuralWeirdness.arraysAsObjects);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('0', 'first');
      expect(result.data).toHaveProperty('1', 'second');
      expect(result.data).toHaveProperty('2', 'third');
    });

    test('should parse nested arrays as objects', () => {
      const result = parseRobustJson(testCases.structuralWeirdness.nestedArraysAsObjects);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('items');
      expect(result.data.items).toHaveProperty('0');
      expect(result.data.items).toHaveProperty('1');
    });
  });

  describe('Character Issues', () => {
    test('should parse escaped unicode', () => {
      const result = parseRobustJson(testCases.characterIssues.escapedUnicode);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('name', 'Alex');
      expect(result.data).toHaveProperty('symbol', '©');
    });

    test('should parse JSON with BOM prefix', () => {
      const result = parseRobustJson(testCases.characterIssues.bomPrefix, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('data', 'with BOM prefix');
      expect(result.transformations).toContain('removeBOM');
    });

    test('should parse JSON with trailing commas in object', () => {
      const result = parseRobustJson(testCases.characterIssues.trailingCommas, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'john', age: 25 });
      expect(result.transformations).toContain('removeTrailingCommas');
    });

    test('should parse JSON with trailing commas in array', () => {
      const result = parseRobustJson(testCases.characterIssues.trailingCommasArray, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['apple', 'banana', 'cherry']);
      expect(result.transformations).toContain('removeTrailingCommas');
    });

    test('should parse JSON with mixed quotes', () => {
      const result = parseRobustJson(testCases.characterIssues.mixedQuotes, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'john', city: 'new york' });
      expect(result.transformations).toContain('normalizeQuotes');
    });
  });

  describe('Format Variations', () => {
    test('should parse JSONL/NDJSON', () => {
      const result = parseRobustJson(testCases.formatVariations.jsonl, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.transformations).toContain('parseJsonLines');
    });

    test('should parse JSON5 with comments', () => {
      const result = parseRobustJson(testCases.formatVariations.json5Comments, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'john', age: 25 });
      expect(result.transformations).toContain('removeComments');
    });

    test('should parse JSON5 with trailing commas', () => {
      const result = parseRobustJson(testCases.formatVariations.json5TrailingCommas, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('count', 3);
      expect(result.transformations).toContain('removeTrailingCommas');
    });
  });

  describe('Real-world API Response Examples', () => {
    test('should parse malformed API response', () => {
      const result = parseRobustJson(testCases.realWorldExamples.malformedApiResponse, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status', 'success');
      expect(result.data).toHaveProperty('data');
      expect(result.data).toHaveProperty('timestamp', '1640995200');
    });

    test('should parse stringified API response', () => {
      const result = parseRobustJson(testCases.realWorldExamples.stringifiedApiResponse, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('results');
      expect(result.data).toHaveProperty('total');
      expect(result.transformations).toContain('parseStringifiedJson');
    });

    test('should parse nested stringified response', () => {
      const result = parseRobustJson(testCases.realWorldExamples.nestedStringifiedResponse, { logTransformations: true });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('response');
      expect(result.transformations?.length).toBeGreaterThanOrEqual(1);

    });
  });

  describe('Edge Cases', () => {
    test('should fail on empty string', () => {
      const result = parseRobustJson(testCases.edgeCases.empty);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should fail on whitespace only', () => {
      const result = parseRobustJson(testCases.edgeCases.whitespace);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should parse null string', () => {
      const result = parseRobustJson(testCases.edgeCases.nullString);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    test('should parse boolean string', () => {
      const result = parseRobustJson(testCases.edgeCases.booleanString);

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    test('should parse number string', () => {
      const result = parseRobustJson(testCases.edgeCases.numberString);

      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    test('should parse valid JSON', () => {
      const result = parseRobustJson(testCases.edgeCases.validJson);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ valid: 'json', works: true });
    });
  });

  describe('Platform Helper Functions', () => {
    describe('parseApiResponse', () => {
      test('should parse malformed API response', () => {
        const result = parseApiResponse(testCases.realWorldExamples.malformedApiResponse);

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('status');
        expect(result.transformations).toBeDefined();
      });

      test('should parse double encoded response', () => {
        const result = parseApiResponse(testCases.encodingProblems.doubleEncoded);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ name: 'john', age: 25 });
        expect(result.transformations).toContain('parseStringifiedJson');
      });

      test('should parse valid response without transformations', () => {
        const input = '{"valid": "response"}';
        const result = parseApiResponse(input);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ valid: 'response' });
        expect(result.transformations).toHaveLength(0);
      });
    });
  });

  test('should handle large datasets efficiently', () => {
    const largeDataset = {
      users: JSON.stringify(
        Array.from({ length: 1000 }, (_, i) => ({
          id: `${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          active: i % 2 === 0 ? "true" : "false"
        }))
      )
    };

    const problematicJson = JSON.stringify(JSON.stringify(largeDataset));

    const start = performance.now();
    const result = parseRobustJson(problematicJson, { preserveStringTypes: true });
    const end = performance.now();

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('users');
    expect(Array.isArray(result.data.users)).toBe(true);
    expect(result.data.users).toHaveLength(1000);
    expect(end - start).toBeLessThan(1000); 
    expect(result.transformations).toContain('parseStringifiedJson');
  });

  describe('Workflow Integration Tests', () => {
    const apiResponses = [
      // Slack API response (stringified)
      '"{\\"ok\\": true, \\"channels\\": [{\\"id\\": \\"C123\\", \\"name\\": \\"general\\"}]}"',

      // Database API response (mixed encoding)
      '{"rows": "{\\"0\\": {\\"user_id\\": \\"123\\", \\"name\\": \\"John\\"}, \\"1\\": {\\"user_id\\": \\"124\\", \\"name\\": \\"Jane\\"}}", "count": "2"}',

      // External service with BOM
      '\uFEFF{"status": "success", "data": {"items": ["item1", "item2",]}}',

      // Base64 encoded response
      btoa('{"webhook_data": {"event": "user.created", "user": {"id": 123}}}')
    ];

    test('should parse Slack API response', () => {
      const result = parseApiResponse(apiResponses[0]);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('ok', true);
      expect(result.data).toHaveProperty('channels');
      expect(Array.isArray(result.data.channels)).toBe(true);
      expect(result.transformations).toContain('parseStringifiedJson');
    });

    test('should parse database API response', () => {
      const result = parseApiResponse(apiResponses[1]);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('rows');
      expect(result.data).toHaveProperty('count', '2');
      expect(typeof result.data).toBe('object');
    });

    test('should parse external service with BOM', () => {
      const result = parseApiResponse(apiResponses[2]);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status', 'success');
      expect(result.data).toHaveProperty('data');
      expect(result.transformations).toContain('removeBOM');
      expect(result.transformations).toContain('removeTrailingCommas');
    });

    test('should parse base64 encoded response', () => {
      const result = parseApiResponse(apiResponses[3]);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('webhook_data');
      expect(result.data.webhook_data).toHaveProperty('event', 'user.created');
      expect(result.transformations).toContain('parseBase64Json');
    });

    test('all workflow responses should be parseable', () => {
      apiResponses.forEach((response, index) => {
        const result = parseApiResponse(response);
        expect(result.success).toBe(true);
        expect(typeof result.data).toBe('object');
        expect(Object.keys(result.data).length).toBeGreaterThan(0);
      });
    });
  });
});


export { testCases };
import { SelfHealingMode } from '@superglue/client';
import { assertValidArrowFunction } from '@superglue/shared';
import { describe, expect, it, vi } from 'vitest';
import { applyAuthFormat, composeUrl, isSelfHealingEnabled, replaceVariables, sample, transformData } from './helpers.js';
import { maskCredentials } from '@superglue/shared';

vi.mock('axios');

describe('tools utility functions', () => {
  describe('composeUrl', () => {
    it('should correctly compose URLs with slashes', () => {
      expect(composeUrl('http://example.com/', '/path')).toBe('http://example.com/path')
      expect(composeUrl('http://example.com', 'path')).toBe('http://example.com/path')
      expect(composeUrl('http://example.com/', 'path')).toBe('http://example.com/path')
    })

    it('should handle empty or undefined inputs', () => {
      expect(composeUrl('', '')).toBe('https://')
      expect(composeUrl('http://example.com', '')).toBe('http://example.com/')
      expect(composeUrl('', 'path')).toBe('https://path')
    })
  })

  describe('replaceVariables', () => {
    it('should replace variables in template strings', async () => {
      const template = 'Hello {name}, your age is {age}'
      const variables = { name: 'John', age: 30 }
      expect(await replaceVariables(template, variables)).toBe('Hello John, your age is 30')
    })

    it('should keep original placeholder if variable not found', async () => {
      const template = 'Hello {name}, {missing}'
      const variables = { name: 'John' }
      expect(await replaceVariables(template, variables)).toBe('Hello John, {missing}')
    })

    it('should handle the same placeholder multiple times', async () => {
      const template = 'Hello {name}, {name}'
      const variables = { name: 'John' }
      expect(await replaceVariables(template, variables)).toBe('Hello John, John')
    })

    it('should handle JSON template strings', async () => {
      const template = '{"user": "{name}", "details": {"age": {age}}}'
      const variables = { name: 'John', age: 30 }
      expect(await replaceVariables(template, variables)).toBe('{"user": "John", "details": {"age": 30}}')
    })
  })

  describe('applyAuthFormat', () => {
    it('should replace credentials in format string', () => {
      const format = 'Bearer {token}'
      const credentials = { token: '12345' }
      expect(applyAuthFormat(format, credentials)).toBe('Bearer 12345')
    })

    it('should throw error for missing credentials', () => {
      const format = 'Bearer {token}'
      const credentials = {}
      expect(() => applyAuthFormat(format, credentials))
        .toThrow('Missing credential for token')
    })
  })

  describe('sample function', () => {
    it('should return array as is if length is less than sample size', () => {
      const arr = [1, 2, 3];
      const result = sample(arr);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return sampled array if length is greater than sample size', () => {
      const arr = Array.from({ length: 100 }, (_, i) => i);
      const result = sample(arr);
      expect(result).toHaveLength(11);
      expect(result[0]).toBe(0);
      expect(result[9]).toBe(9);
      expect(result[10]).toBe("sampled from " + (arr.length) + " items");
    });

    it('should handle non-array input', () => {
      const obj = { test: 'value' };
      const result = sample(obj);
      expect(result).toEqual(obj);
    });

    it('should respect custom sample size', () => {
      const arr = Array.from({ length: 100 }, (_, i) => i);
      const result = sample(arr, 5);
      expect(result).toHaveLength(6);
      expect(result[0]).toBe(0);
      expect(result[5]).toBe("sampled from " + (arr.length) + " items");
    });
  });

  describe('maskCredentials', () => {
    it('should mask credentials in message globally', () => {
      const message = 'My password is 123456. Remember it is 123456! My username is admin.';
      const credentials = { password: '123456', username: 'admin' };
      const result = maskCredentials(message, credentials);
      expect(result).toBe('My password is {masked_password}. Remember it is {masked_password}! My username is {masked_username}.');
    });

    it('should return message if no credentials are provided', () => {
      const message = 'My password is 123456';
      const result = maskCredentials(message);
      expect(result).toBe(message);
    });
  });

  describe('isSelfHealingEnabled', () => {
    describe('transform type', () => {
      it('should return true for ENABLED mode', () => {
        const options = { selfHealing: SelfHealingMode.ENABLED };
        expect(isSelfHealingEnabled(options, 'transform')).toBe(true);
      });

      it('should return true for TRANSFORM_ONLY mode', () => {
        const options = { selfHealing: SelfHealingMode.TRANSFORM_ONLY };
        expect(isSelfHealingEnabled(options, 'transform')).toBe(true);
      });

      it('should return false for REQUEST_ONLY mode', () => {
        const options = { selfHealing: SelfHealingMode.REQUEST_ONLY };
        expect(isSelfHealingEnabled(options, 'transform')).toBe(false);
      });

      it('should return false for DISABLED mode', () => {
        const options = { selfHealing: SelfHealingMode.DISABLED };
        expect(isSelfHealingEnabled(options, 'transform')).toBe(false);
      });

      it('should default to false when selfHealing is undefined', () => {
        const options = {};
        expect(isSelfHealingEnabled(options, 'transform')).toBe(false);
      });

      it('should default to false when options is undefined', () => {
        expect(isSelfHealingEnabled(undefined, 'transform')).toBe(false);
      });
    });

    describe('api type', () => {
      it('should return true for ENABLED mode', () => {
        const options = { selfHealing: SelfHealingMode.ENABLED };
        expect(isSelfHealingEnabled(options, 'api')).toBe(true);
      });

      it('should return true for REQUEST_ONLY mode', () => {
        const options = { selfHealing: SelfHealingMode.REQUEST_ONLY };
        expect(isSelfHealingEnabled(options, 'api')).toBe(true);
      });

      it('should return false for TRANSFORM_ONLY mode', () => {
        const options = { selfHealing: SelfHealingMode.TRANSFORM_ONLY };
        expect(isSelfHealingEnabled(options, 'api')).toBe(false);
      });

      it('should return false for DISABLED mode', () => {
        const options = { selfHealing: SelfHealingMode.DISABLED };
        expect(isSelfHealingEnabled(options, 'api')).toBe(false);
      });

      it('should default to false when selfHealing is undefined', () => {
        const options = {};
        expect(isSelfHealingEnabled(options, 'api')).toBe(false);
      });

      it('should default to false when options is undefined', () => {
        expect(isSelfHealingEnabled(undefined, 'api')).toBe(false);
      });
    });
  });

  describe('assertValidArrowFunction', () => {
    it('should convert $ identity sentinel to identity function', () => {
      const result = assertValidArrowFunction('$');
      expect(result).toBe('(sourceData) => {\n  return sourceData;\n}');
    });

    it('should return empty object function for empty string (for loopSelector)', () => {
      const result = assertValidArrowFunction('');
      expect(result).toBe('(sourceData) => {\n  return {};\n}');
    });

    it('should return empty object function for null', () => {
      const result = assertValidArrowFunction(null);
      expect(result).toBe('(sourceData) => {\n  return {};\n}');
    });

    it('should return empty object function for undefined', () => {
      const result = assertValidArrowFunction(undefined);
      expect(result).toBe('(sourceData) => {\n  return {};\n}');
    });

    it('should preserve valid arrow function with block body', () => {
      const code = '(sourceData) => { return sourceData.foo; }';
      const result = assertValidArrowFunction(code);
      expect(result).toBe(code);
    });

    it('should preserve valid arrow function with parenthesized expr', () => {
      const code = '(sourceData) => (sourceData.foo)';
      const result = assertValidArrowFunction(code);
      expect(result).toBe(code);
    });

    it('should preserve arrow function with identifier-only param', () => {
      const code = 'param => sourceData[param]';
      const result = assertValidArrowFunction(code);
      expect(result).toBe(code);
    });

    it('should throw error for raw code (not arrow function)', () => {
      const code = 'return sourceData.foo';
      expect(() => assertValidArrowFunction(code))
        .toThrow('Invalid arrow function');
    });
  });

  describe('transformData with $ identity sentinel', () => {
    it('should pass through data unchanged when code is $', async () => {
      const testData = { test: 'value', nested: { foo: 'bar' } };
      const result = await transformData(testData, '$');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testData);
      expect(result.code).toBe('$');
    });

    it('should handle $ sentinel after assertValidArrowFunction', async () => {
      const testData = { test: 'value', nested: { foo: 'bar' } };
      const wrappedCode = assertValidArrowFunction('$');
      const result = await transformData(testData, wrappedCode);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testData);
    });

    it('should return {} for empty code string (no transformation)', async () => {
      const testData = { test: 'value' };
      const result = await transformData(testData, '');
      expect(result.success).toBe(true);
      expect(result.data).toStrictEqual({});
    });

    it('should return empty object when empty code is wrapped with assertValidArrowFunction', async () => {
      const testData = { test: 'value' };
      const wrappedCode = assertValidArrowFunction('');
      const result = await transformData(testData, wrappedCode);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
  });
}) 

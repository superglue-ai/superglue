import { SelfHealingMode } from '@superglue/client';
import { describe, expect, it, vi } from 'vitest';
import { applyAuthFormat, composeUrl, ensureSourceDataArrowFunction, isSelfHealingEnabled, maskCredentials, replaceVariables, sample } from './helpers.js';

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

      it('should default to true when selfHealing is undefined', () => {
        const options = {};
        expect(isSelfHealingEnabled(options, 'transform')).toBe(true);
      });

      it('should default to true when options is undefined', () => {
        expect(isSelfHealingEnabled(undefined, 'transform')).toBe(true);
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

      it('should default to true when selfHealing is undefined', () => {
        const options = {};
        expect(isSelfHealingEnabled(options, 'api')).toBe(true);
      });

      it('should default to true when options is undefined', () => {
        expect(isSelfHealingEnabled(undefined, 'api')).toBe(true);
      });
    });
  });

  describe('ensureSourceDataArrowFunction', () => {
    it('should return fallback for empty/null/undefined code', () => {
      const fallback = `(sourceData) => {\n  return sourceData;\n}`;
      expect(ensureSourceDataArrowFunction('')).toBe(fallback);
      expect(ensureSourceDataArrowFunction(null)).toBe(fallback);
      expect(ensureSourceDataArrowFunction(undefined)).toBe(fallback);
      expect(ensureSourceDataArrowFunction('   ')).toBe(fallback);
    });

    it('should accept arrow functions with sourceData parameter', () => {
      expect(ensureSourceDataArrowFunction('(sourceData) => sourceData.id')).toBe('(sourceData) => sourceData.id');
      expect(ensureSourceDataArrowFunction('(sourceData) => { return sourceData.id; }')).toBe('(sourceData) => { return sourceData.id; }');
    });

    it('should accept arrow functions with any valid parameter name', () => {
      expect(ensureSourceDataArrowFunction('(payload) => payload.id')).toBe('(payload) => payload.id');
      expect(ensureSourceDataArrowFunction('(data) => data.value')).toBe('(data) => data.value');
      expect(ensureSourceDataArrowFunction('(x) => x.name')).toBe('(x) => x.name');
      expect(ensureSourceDataArrowFunction('(_input) => _input.field')).toBe('(_input) => _input.field');
      expect(ensureSourceDataArrowFunction('($data) => $data.prop')).toBe('($data) => $data.prop');
    });

    it('should accept arrow functions with block body and any parameter name', () => {
      expect(ensureSourceDataArrowFunction('(payload) => { return payload.id; }')).toBe('(payload) => { return payload.id; }');
      expect(ensureSourceDataArrowFunction('(data) => { const x = data.a; return x; }')).toBe('(data) => { const x = data.a; return x; }');
    });

    it('should accept parenthesized expressions with any parameter name', () => {
      expect(ensureSourceDataArrowFunction('(payload) => (payload.items)')).toBe('(payload) => (payload.items)');
      expect(ensureSourceDataArrowFunction('(data) => ({ id: data.id })')).toBe('(data) => ({ id: data.id })');
    });

    it('should wrap non-arrow-function code', () => {
      expect(ensureSourceDataArrowFunction('return sourceData.id')).toBe('(sourceData) => {\nreturn sourceData.id\n}');
      expect(ensureSourceDataArrowFunction('sourceData.id')).toBe('(sourceData) => {\nsourceData.id\n}');
    });
  });
}) 

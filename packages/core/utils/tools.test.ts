import { describe, it, expect } from 'vitest'
import { composeUrl, replaceVariables, applyJsonata, applyJsonataWithValidation, getAllKeys, applyAuthFormat, sample, maskCredentials } from './tools.js'

describe('tools utility functions', () => {
  describe('composeUrl', () => {
    it('should correctly compose URLs with slashes', () => {
      expect(composeUrl('http://example.com/', '/path')).toBe('http://example.com/path')
      expect(composeUrl('http://example.com', 'path')).toBe('http://example.com/path')
      expect(composeUrl('http://example.com/', 'path')).toBe('http://example.com/path')
    })

    it('should handle empty or undefined inputs', () => {
      expect(composeUrl('', '')).toBe('/')
      expect(composeUrl('http://example.com', '')).toBe('http://example.com/')
      expect(composeUrl('', 'path')).toBe('/path')
    })
  })

  describe('replaceVariables', () => {
    it('should replace variables in template strings', () => {
      const template = 'Hello {name}, your age is {age}'
      const variables = { name: 'John', age: 30 }
      expect(replaceVariables(template, variables)).toBe('Hello John, your age is 30')
    })

    it('should keep original placeholder if variable not found', () => {
      const template = 'Hello {name}, {missing}'
      const variables = { name: 'John' }
      expect(replaceVariables(template, variables)).toBe('Hello John, {missing}')
    })

    it('should handle the same placeholder multiple times', () => {
      const template = 'Hello {name}, {name}'
      const variables = { name: 'John' }
      expect(replaceVariables(template, variables)).toBe('Hello John, John')
    })
  })

  describe('applyJsonata', () => {
    it('should transform data according to expression', async () => {
      const data = { name: 'John', age: 30 }
      const expr = '{ "fullName": name, "isAdult": age > 18 }'
      const result = await applyJsonata(data, expr)
      expect(result).toEqual({
        fullName: 'John',
        isAdult: true
      })
    })

    it('should throw error for invalid expressions', async () => {
      const data = { name: 'John' }
      const expr = 'invalid }'
      await expect(applyJsonata(data, expr)).rejects.toThrow()
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

  describe('getAllKeys', () => {
    it('should get all keys from nested object', () => {
      const obj = {
        a: 1,
        b: {
          c: 2,
          d: {
            e: 3
          }
        }
      }
      const keys = getAllKeys(obj)
      expect(keys).toEqual(['number:a', 'number:c', 'number:e', 'object:b', 'object:d'])
    })

    it('should handle empty objects', () => {
      expect(getAllKeys({})).toEqual([])
    })

    it('should handle arrays', () => {
      const obj = {
        items: [
          { id: 1 },
          { id: 2 }
        ]
      }
      const keys = getAllKeys(obj)
      expect(keys).toEqual(['number:id', 'number:id', 'object:items'])
    })
  })

  describe('applyJsonataWithValidation', () => {
    it('should transform and validate data successfully', async () => {
      const data = { name: 'test', value: 123 }
      const expr = '{ "transformed": name & " " & value }'
      const schema = {
        type: 'object',
        properties: {
          transformed: { type: 'string' }
        }
      }

      const result = await applyJsonataWithValidation(data, expr, schema)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ transformed: 'test 123' })
    })

    it('should return error for invalid transformation', async () => {
      const data = { name: 'test' }
      const expr = 'invalid expression'
      const schema = { type: 'object' }

      const result = await applyJsonataWithValidation(data, expr, schema)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return error for schema validation failure', async () => {
      const data = { name: 'test' }
      const expr = '{ "num": name }'
      const schema = {
        type: 'object',
        properties: {
          num: { type: 'number' }
        }
      }

      const result = await applyJsonataWithValidation(data, expr, schema)
      expect(result.success).toBe(false)
      expect(result.error).toContain('type')
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
      expect(result).toHaveLength(10);
      expect(result[0]).toBe(0);
      expect(result[9]).toBe(90);
    });

    it('should handle non-array input', () => {
      const obj = { test: 'value' };
      const result = sample(obj);
      expect(result).toEqual([obj]);
    });

    it('should respect custom sample size', () => {
      const arr = Array.from({ length: 100 }, (_, i) => i);
      const result = sample(arr, 5);
      expect(result).toHaveLength(5);
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
}) 
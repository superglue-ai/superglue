import { SelfHealingMode } from '@superglue/client';
import { describe, expect, it, vi } from 'vitest';
import { applyAuthFormat, applyJsonata, applyJsonataWithValidation, composeUrl, isSelfHealingEnabled, maskCredentials, replaceVariables, safeHttpMethod, sample } from './helpers.js';

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

  describe('superglueJsonata dateDiff function', () => {
    it('should calculate date differences correctly with UTC dates', async () => {
      const data = { dates: ['2024-03-15T00:00:00Z', '2024-03-16T00:00:00Z'] };
      const expr = '$dateDiff(dates[0], dates[1])';
      const result = await applyJsonata(data, expr);
      expect(result).toBe(1); // 1 day difference
    });

    it('should handle timezone-aware dates correctly', async () => {
      const data = {
        dates: [
          '2024-03-15T00:00:00-05:00',  // New York time
          '2024-03-15T10:00:00+05:00'   // India time
        ]
      };
      const expr = '$dateDiff(dates[0], dates[1])';
      const result = await applyJsonata(data, expr);
      expect(result).toBe(0); // Same day after timezone normalization
    });

    it('should calculate differences in various units', async () => {
      const data = {
        start: '2024-03-15T10:30:00Z',
        end: '2024-03-15T12:45:30Z'
      };
      const tests = [
        { unit: 'seconds', expected: 8130 },
        { unit: 'minutes', expected: 135 },
        { unit: 'hours', expected: 2 }
      ];

      for (const test of tests) {
        const expr = `$dateDiff(start, end, '${test.unit}')`;
        const result = await applyJsonata(data, expr);
        expect(result).toBe(test.expected);
      }
    });

    it('should handle mixing timezone and non-timezone dates', async () => {
      const data = {
        dates: [
          '2024-03-15T15:00:00-05:00',  // 3 PM New York time (8 PM UTC)
          '2024-03-15T20:00:00Z'        // 8 PM UTC
        ]
      };
      const expr = '$dateDiff(dates[0], dates[1], "hours")';
      const result = await applyJsonata(data, expr);
      expect(result).toBe(0); // Same time after timezone normalization
    });
  });

  describe('superglueJsonata utility functions', () => {
    it('should calculate min and max correctly', async () => {
      const data = { numbers: [5, 2, 8.2, 1, 0.1, 9] };
      const minExpr = '$min(numbers)';
      const maxExpr = '$max(numbers)';

      const minResult = await applyJsonata(data, minExpr);
      const maxResult = await applyJsonata(data, maxExpr);

      expect(minResult).toBe(0.1);
      expect(maxResult).toBe(9);
    });

    it('should handle empty arrays in min and max', async () => {
      const data = { numbers: [] };
      const minExpr = '$min(numbers)';
      const maxExpr = '$max(numbers)';

      const minResult = await applyJsonata(data, minExpr);
      const maxResult = await applyJsonata(data, maxExpr);

      expect(minResult).toBe(Infinity);
      expect(maxResult).toBe(-Infinity);
    });

    it('should convert strings to ISO dates', async () => {
      const data = {
        isoDate: '2024-03-15T10:30:00Z',
        usDate: '03/15/2024 03:30:00'
      };

      const isoResult = await applyJsonata(data, '$toDate(isoDate)');
      const usResult = await applyJsonata(data, '$toDate(usDate)');

      expect(isoResult).toBe('2024-03-15T10:30:00.000Z');
      expect(usResult).toBe('2024-03-15T03:30:00.000Z');
    });

    it('should throw error for invalid date strings', async () => {
      const data = { date: '2025/21/02 10:30:00' };
      const expr = '$toDate(date)';
      await expect(applyJsonata(data, expr)).rejects.toThrow('Invalid time value');
    });

    it('should handle various date formats in toDate', async () => {
      const data = {
        dates: {
          iso: '2024-03-15T10:30:00Z',
          simple: '2024-03-15',
          withTime: '2024-03-15 10:30:00',
          withTz: '2024-03-15T10:30:00+01:00'
        }
      };

      const results = await Promise.all([
        applyJsonata(data, '$toDate(dates.iso)'),
        applyJsonata(data, '$toDate(dates.simple)'),
        applyJsonata(data, '$toDate(dates.withTime)'),
        applyJsonata(data, '$toDate(dates.withTz)')
      ]);

      results.forEach(result => {
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      });
    });

    it('should handle timezone-aware dates in dateMin and dateMax and work', async () => {
      const data = {
        dates: [
          '2024-03-15T10:00:00-05:00',  // 3 PM EST
          '2024-03-15T16:00:00+01:00',  // 4 PM CET
          '2024-03-15T20:00:00Z'        // 8 PM UTC
        ]
      };

      const minExpr = '$dateMin(dates)';
      const maxExpr = '$dateMax(dates)';

      const earliestDate = await applyJsonata(data, minExpr);
      const latestDate = await applyJsonata(data, maxExpr);

      // All represent same day, but different times
      expect(new Date(earliestDate).getUTCHours()).toBe(15); // 10:00 EST = 15:00 UTC
      expect(new Date(latestDate).getUTCHours()).toBe(20);   // 20:00 UTC
    });
  });

  describe('safeHttpMethod', () => {
    it('returns the method if it is a valid HttpMethod (case sensitive)', () => {
      expect(safeHttpMethod('GET')).toBe('GET');
      expect(safeHttpMethod('POST')).toBe('POST');
      expect(safeHttpMethod('DELETE')).toBe('DELETE');
    });

    it('returns the uppercased method if it is a valid HttpMethod (case insensitive)', () => {
      expect(safeHttpMethod('get')).toBe('GET');
      expect(safeHttpMethod('post')).toBe('POST');
      expect(safeHttpMethod('delete')).toBe('DELETE');
    });

    it('returns "GET" if the method is invalid', () => {
      expect(safeHttpMethod('FOO')).toBe('GET');
      expect(safeHttpMethod(undefined)).toBe('GET');
      expect(safeHttpMethod(null)).toBe('GET');
      expect(safeHttpMethod(123)).toBe('GET');
    });

    it('accepts HttpMethodEnum additions', () => {
      // If you add "HEAD" or "OPTIONS" to HttpMethodEnum, this will pass
      expect(['HEAD', 'OPTIONS']).toContain(safeHttpMethod('head'));
      expect(['HEAD', 'OPTIONS']).toContain(safeHttpMethod('OPTIONS'));
    });

    it('does not throw if method is undefined or null', () => {
      expect(() => safeHttpMethod(undefined)).not.toThrow();
      expect(() => safeHttpMethod(null)).not.toThrow();
      expect(safeHttpMethod(undefined)).toBe('GET');
      expect(safeHttpMethod(null)).toBe('GET');
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
}) 

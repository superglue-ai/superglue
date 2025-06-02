import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertBasicAuthToBase64 } from './api.js';

describe('Basic Auth Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('convertBasicAuthToBase64', () => {
    it('should encode username:password format', () => {
      expect(convertBasicAuthToBase64('Basic test:1234')).toBe('Basic dGVzdDoxMjM0');
    });

    it('should leave already encoded credentials unchanged', () => {
      expect(convertBasicAuthToBase64('Basic dGVzdDoxMjM0')).toBe('Basic dGVzdDoxMjM0');
    });

    it('should leave non-Basic Auth headers unchanged', () => {
      expect(convertBasicAuthToBase64('Bearer token123')).toBe('Bearer token123');
    });

    it('should handle undefined or null values', () => {
      expect(convertBasicAuthToBase64(undefined)).toBeUndefined();
      expect(convertBasicAuthToBase64(null)).toBeNull();
    });
  });
});
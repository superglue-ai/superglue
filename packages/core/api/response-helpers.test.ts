import { RunStatus } from '@superglue/shared';
import { describe, expect, it } from 'vitest';
import {
    mapOpenAPIStatusToInternal,
    mapRunStatusToOpenAPI,
    parsePaginationParams,
} from './response-helpers.js';

describe('response-helpers', () => {
  describe('mapRunStatusToOpenAPI', () => {
    it('should map all RunStatus values correctly', () => {
      expect(mapRunStatusToOpenAPI(RunStatus.RUNNING)).toBe('running');
      expect(mapRunStatusToOpenAPI(RunStatus.SUCCESS)).toBe('success');
      expect(mapRunStatusToOpenAPI(RunStatus.FAILED)).toBe('failed');
      expect(mapRunStatusToOpenAPI(RunStatus.ABORTED)).toBe('aborted');
    });

    it('should default to failed for unknown status', () => {
      expect(mapRunStatusToOpenAPI('unknown' as RunStatus)).toBe('failed');
    });
  });

  describe('mapOpenAPIStatusToInternal', () => {
    it('should map all OpenAPI status values correctly', () => {
      expect(mapOpenAPIStatusToInternal('running')).toBe(RunStatus.RUNNING);
      expect(mapOpenAPIStatusToInternal('success')).toBe(RunStatus.SUCCESS);
      expect(mapOpenAPIStatusToInternal('failed')).toBe(RunStatus.FAILED);
      expect(mapOpenAPIStatusToInternal('aborted')).toBe(RunStatus.ABORTED);
    });

    it('should handle case-insensitive input', () => {
      expect(mapOpenAPIStatusToInternal('RUNNING')).toBe(RunStatus.RUNNING);
      expect(mapOpenAPIStatusToInternal('Success')).toBe(RunStatus.SUCCESS);
      expect(mapOpenAPIStatusToInternal('FAILED')).toBe(RunStatus.FAILED);
    });

    it('should return undefined for unknown status', () => {
      expect(mapOpenAPIStatusToInternal('unknown')).toBeUndefined();
      expect(mapOpenAPIStatusToInternal('')).toBeUndefined();
    });
  });

  describe('parsePaginationParams', () => {
    it('should use defaults when no params provided', () => {
      expect(parsePaginationParams({})).toEqual({ page: 1, limit: 50, offset: 0 });
    });

    it('should parse valid page and limit', () => {
      expect(parsePaginationParams({ page: '2', limit: '25' })).toEqual({
        page: 2,
        limit: 25,
        offset: 25,
      });
    });

    it('should handle NaN values gracefully', () => {
      expect(parsePaginationParams({ page: 'abc', limit: 'xyz' })).toEqual({
        page: 1,
        limit: 50,
        offset: 0,
      });
    });

    it('should clamp page to minimum of 1', () => {
      expect(parsePaginationParams({ page: '0' })).toEqual({ page: 1, limit: 50, offset: 0 });
      expect(parsePaginationParams({ page: '-5' })).toEqual({ page: 1, limit: 50, offset: 0 });
    });

    it('should clamp limit between 1 and 100', () => {
      expect(parsePaginationParams({ limit: '1' })).toEqual({ page: 1, limit: 1, offset: 0 });
      expect(parsePaginationParams({ limit: '200' })).toEqual({ page: 1, limit: 100, offset: 0 });
    });

    it('should treat 0 as default (falsy fallback)', () => {
      expect(parsePaginationParams({ limit: '0' })).toEqual({ page: 1, limit: 50, offset: 0 });
    });

    it('should clamp negative limits to 1', () => {
      expect(parsePaginationParams({ limit: '-10' })).toEqual({ page: 1, limit: 1, offset: 0 });
    });

    it('should calculate offset correctly', () => {
      expect(parsePaginationParams({ page: '3', limit: '10' })).toEqual({
        page: 3,
        limit: 10,
        offset: 20,
      });
    });
  });
});


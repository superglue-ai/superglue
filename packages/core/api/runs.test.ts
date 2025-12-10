import { Run, RunStatus } from '@superglue/shared';
import { describe, expect, it } from 'vitest';
import { mapRunToOpenAPI } from './runs.js';

describe('runs API', () => {
  describe('mapRunToOpenAPI', () => {
    const baseRun: Run = {
      id: 'run-123',
      toolId: 'tool-456',
      status: RunStatus.SUCCESS,
      startedAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: new Date('2024-01-01T10:01:00Z'),
      toolPayload: { input: 'test' },
      toolResult: { output: 'result' },
      orgId: 'org-123',
    };

    it('should map basic run fields correctly', () => {
      const result = mapRunToOpenAPI(baseRun);

      expect(result.runId).toBe('run-123');
      expect(result.toolId).toBe('tool-456');
      expect(result.status).toBe('success');
      expect(result.toolPayload).toEqual({ input: 'test' });
      expect(result.data).toEqual({ output: 'result' });
    });

    it('should format dates as ISO strings', () => {
      const result = mapRunToOpenAPI(baseRun);

      expect(result.metadata.startedAt).toBe('2024-01-01T10:00:00.000Z');
      expect(result.metadata.completedAt).toBe('2024-01-01T10:01:00.000Z');
    });

    it('should calculate duration in milliseconds', () => {
      const result = mapRunToOpenAPI(baseRun);

      expect(result.metadata.durationMs).toBe(60000);
    });

    it('should handle string dates', () => {
      const runWithStringDates = {
        ...baseRun,
        startedAt: '2024-01-01T10:00:00Z' as unknown as Date,
        completedAt: '2024-01-01T10:01:00Z' as unknown as Date,
      };

      const result = mapRunToOpenAPI(runWithStringDates);

      expect(result.metadata.startedAt).toBe('2024-01-01T10:00:00.000Z');
      expect(result.metadata.completedAt).toBe('2024-01-01T10:01:00.000Z');
    });

    it('should handle run without completedAt', () => {
      const runningRun = {
        ...baseRun,
        status: RunStatus.RUNNING,
        completedAt: undefined,
      };

      const result = mapRunToOpenAPI(runningRun);

      expect(result.metadata.completedAt).toBeUndefined();
      expect(result.metadata.durationMs).toBeUndefined();
    });

    it('should map toolConfig to tool field', () => {
      const runWithConfig = {
        ...baseRun,
        toolConfig: { id: 'config-id', version: '2.0.0' },
      } as Run;

      const result = mapRunToOpenAPI(runWithConfig);

      expect(result.tool).toEqual({ id: 'config-id', version: '2.0.0' });
    });

    it('should default tool version to 1.0.0', () => {
      const runWithConfigNoVersion = {
        ...baseRun,
        toolConfig: { id: 'config-id' },
      } as Run;

      const result = mapRunToOpenAPI(runWithConfigNoVersion);

      expect(result.tool).toEqual({ id: 'config-id', version: '1.0.0' });
    });

    it('should map stepResults correctly', () => {
      const runWithSteps = {
        ...baseRun,
        stepResults: [
          { stepId: 'step-1', success: true, data: { foo: 'bar' } },
          { stepId: 'step-2', success: false, error: 'Something went wrong' },
        ],
      } as Run;

      const result = mapRunToOpenAPI(runWithSteps);

      expect(result.stepResults).toEqual([
        { stepId: 'step-1', success: true, data: { foo: 'bar' }, error: undefined },
        { stepId: 'step-2', success: false, data: undefined, error: 'Something went wrong' },
      ]);
    });

    it('should include error field for failed runs', () => {
      const failedRun = {
        ...baseRun,
        status: RunStatus.FAILED,
        error: 'API timeout',
      };

      const result = mapRunToOpenAPI(failedRun);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('API timeout');
    });
  });
});

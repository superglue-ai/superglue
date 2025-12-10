import { ExecutionStep, HttpMethod, PaginationType, RunStatus, Tool } from '@superglue/shared';
import { describe, expect, it } from 'vitest';
import { ApiConfig } from '../../shared/types.js';
import {
    buildRunResponse,
    mapFailureBehavior,
    mapPaginationType,
    mapStepToOpenAPI,
    mapToolToOpenAPI
} from './tools.js';

describe('tools API helpers', () => {
  describe('mapPaginationType', () => {
    it('should map all known pagination types', () => {
      expect(mapPaginationType('OFFSET_BASED')).toBe('offsetBased');
      expect(mapPaginationType('PAGE_BASED')).toBe('pageBased');
      expect(mapPaginationType('CURSOR_BASED')).toBe('cursorBased');
      expect(mapPaginationType('DISABLED')).toBe('disabled');
    });

    it('should return disabled for undefined input', () => {
      expect(mapPaginationType(undefined)).toBe('disabled');
    });

    it('should lowercase unknown types', () => {
      expect(mapPaginationType('CUSTOM_TYPE')).toBe('custom_type');
    });
  });

  describe('mapFailureBehavior', () => {
    it('should map fail behavior', () => {
      expect(mapFailureBehavior('FAIL')).toBe('fail');
      expect(mapFailureBehavior('fail')).toBe('fail');
    });

    it('should map continue behavior', () => {
      expect(mapFailureBehavior('CONTINUE')).toBe('continue');
      expect(mapFailureBehavior('continue')).toBe('continue');
    });

    it('should return undefined for undefined input', () => {
      expect(mapFailureBehavior(undefined)).toBeUndefined();
    });
  });

  describe('mapStepToOpenAPI', () => {
    const baseStep: ExecutionStep = {
      id: 'step-1',
      apiConfig: {
        urlHost: 'https://api.example.com',
        urlPath: '/users',
        method: HttpMethod.GET,
        instruction: 'Fetch users',
        id: 'step-1',
      },
    };

    it('should map basic step fields', () => {
      const result = mapStepToOpenAPI(baseStep);

      expect(result.id).toBe('step-1');
      expect(result.url).toBe('https://api.example.com/users');
      expect(result.method).toBe('GET');
    });

    it('should default method to GET', () => {
      const stepWithoutMethod: ExecutionStep = {
        id: 'step-1',
        apiConfig: {
          id: 'step-1',
          instruction: 'Fetch users',
          urlHost: 'https://api.example.com',
          urlPath: '/users',
        },
      };

      const result = mapStepToOpenAPI(stepWithoutMethod);
      expect(result.method).toBe('GET');
    });

    it('should include optional fields when present', () => {
      const stepWithOptionals: ExecutionStep = {
        ...baseStep,
        apiConfig: {
          ...baseStep.apiConfig,
          queryParams: { search: 'test' },
          headers: { 'X-Api-Key': 'secret' },
          body: '{"name": "test"}',
          instruction: 'Fetch users',
        },
        integrationId: 'integration-123',
        modify: true,
        loopSelector: '$.data[*]',
        failureBehavior: 'CONTINUE',
      };

      const result = mapStepToOpenAPI(stepWithOptionals);

      expect(result.queryParams).toEqual({ search: 'test' });
      expect(result.headers).toEqual({ 'X-Api-Key': 'secret' });
      expect(result.body).toBe('{"name": "test"}');
      expect(result.instruction).toBe('Fetch users');
      expect(result.systemId).toBe('integration-123');
      expect(result.modify).toBe(true);
      expect(result.dataSelector).toBe('$.data[*]');
      expect(result.failureBehavior).toBe('continue');
    });

    it('should map pagination config', () => {
      const stepWithPagination: ExecutionStep = {
        ...baseStep,
        apiConfig: {
          ...baseStep.apiConfig,
          pagination: {
            type: PaginationType.CURSOR_BASED,
            pageSize: '50',
            cursorPath: '$.nextCursor',
            stopCondition: '$.hasMore === false',
          },
        },
      };

      const result = mapStepToOpenAPI(stepWithPagination);

      expect(result.pagination).toEqual({
        type: 'cursorBased',
        pageSize: 50,
        cursorPath: '$.nextCursor',
        stopCondition: '$.hasMore === false',
      });
    });

    it('should handle empty urlHost and urlPath', () => {
      const stepWithEmptyUrl: ExecutionStep = {
        id: 'step-1',
        apiConfig: {} as ApiConfig,
      };

      const result = mapStepToOpenAPI(stepWithEmptyUrl);
      expect(result.url).toBe('');
    });
  });

  describe('mapToolToOpenAPI', () => {
    const baseTool: Tool = {
      id: 'tool-123',
      instruction: 'Test tool instruction',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      responseSchema: { type: 'object', properties: { result: { type: 'string' } } },
      steps: [
        {
          id: 'step-1',
          apiConfig: {
            urlHost: 'https://api.example.com',
            urlPath: '/test',
            method: HttpMethod.POST,
            instruction: 'Test step instruction',
            id: 'step-1',
          },
        },
      ],
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    };

    it('should map basic tool fields', () => {
      const result = mapToolToOpenAPI(baseTool);

      expect(result.id).toBe('tool-123');
      expect(result.name).toBe('tool-123');
      expect(result.instruction).toBe('Test tool instruction');
      expect(result.inputSchema).toEqual({ type: 'object', properties: { name: { type: 'string' } } });
      expect(result.outputSchema).toEqual({ type: 'object', properties: { result: { type: 'string' } } });
    });

    it('should default version to 1.0.0', () => {
      const result = mapToolToOpenAPI(baseTool);
      expect(result.version).toBe('1.0.0');
    });

    it('should use provided version', () => {
      const toolWithVersion = { ...baseTool, version: '2.0.0' };
      const result = mapToolToOpenAPI(toolWithVersion);
      expect(result.version).toBe('2.0.0');
    });

    it('should map steps', () => {
      const result = mapToolToOpenAPI(baseTool);

      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].id).toBe('step-1');
      expect(result.steps[0].url).toBe('https://api.example.com/test');
    });

    it('should include finalTransform as outputTransform', () => {
      const toolWithTransform = { ...baseTool, finalTransform: '$.data' };
      const result = mapToolToOpenAPI(toolWithTransform);
      expect(result.outputTransform).toBe('$.data');
    });

    it('should format dates as ISO strings', () => {
      const result = mapToolToOpenAPI(baseTool);

      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should handle string dates', () => {
      const toolWithStringDates = {
        ...baseTool,
        createdAt: '2024-01-01T00:00:00Z' as unknown as Date,
        updatedAt: '2024-01-02T00:00:00Z' as unknown as Date,
      };

      const result = mapToolToOpenAPI(toolWithStringDates);

      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(result.updatedAt).toBe('2024-01-02T00:00:00Z');
    });
  });

  describe('buildRunResponse', () => {
    const baseTool: Tool = {
      id: 'tool-123',
      instruction: 'Test tool',
      steps: [],
    };

    const baseParams = {
      runId: 'run-456',
      tool: baseTool,
      status: RunStatus.SUCCESS,
      requestSource: 'api',
      startedAt: new Date('2024-01-01T10:00:00Z'),
    };

    it('should build basic run response', () => {
      const result = buildRunResponse(baseParams);

      expect(result.runId).toBe('run-456');
      expect(result.toolId).toBe('tool-123');
      expect(result.tool).toEqual({ id: 'tool-123', version: '1.0.0' });
      expect(result.status).toBe('success');
      expect(result.requestSource).toBe('api');
    });

    it('should include metadata with startedAt', () => {
      const result = buildRunResponse(baseParams);

      expect(result.metadata.startedAt).toBe('2024-01-01T10:00:00.000Z');
      expect(result.metadata.completedAt).toBeUndefined();
      expect(result.metadata.durationMs).toBeUndefined();
    });

    it('should calculate duration when completedAt is provided', () => {
      const result = buildRunResponse({
        ...baseParams,
        completedAt: new Date('2024-01-01T10:01:00Z'),
      });

      expect(result.metadata.completedAt).toBe('2024-01-01T10:01:00.000Z');
      expect(result.metadata.durationMs).toBe(60000);
    });

    it('should include optional fields', () => {
      const result = buildRunResponse({
        ...baseParams,
        toolPayload: { input: 'test' },
        data: { output: 'result' },
        error: 'Some error',
        traceId: 'trace-789',
        options: { timeout: 30000 },
      });

      expect(result.toolPayload).toEqual({ input: 'test' });
      expect(result.data).toEqual({ output: 'result' });
      expect(result.error).toBe('Some error');
      expect(result.traceId).toBe('trace-789');
      expect(result.options).toEqual({ timeout: 30000 });
    });

    it('should map stepResults', () => {
      const result = buildRunResponse({
        ...baseParams,
        stepResults: [
          { stepId: 'step-1', success: true, data: { foo: 'bar' } },
          { stepId: 'step-2', success: false, error: 'Failed' },
        ],
      });

      expect(result.stepResults).toEqual([
        { stepId: 'step-1', success: true, data: { foo: 'bar' }, error: undefined },
        { stepId: 'step-2', success: false, data: undefined, error: 'Failed' },
      ]);
    });

    it('should map all run statuses correctly', () => {
      expect(buildRunResponse({ ...baseParams, status: RunStatus.RUNNING }).status).toBe('running');
      expect(buildRunResponse({ ...baseParams, status: RunStatus.SUCCESS }).status).toBe('success');
      expect(buildRunResponse({ ...baseParams, status: RunStatus.FAILED }).status).toBe('failed');
      expect(buildRunResponse({ ...baseParams, status: RunStatus.ABORTED }).status).toBe('aborted');
    });

    it('should use tool version if provided', () => {
      const toolWithVersion = { ...baseTool, version: '2.5.0' };
      const result = buildRunResponse({ ...baseParams, tool: toolWithVersion });

      expect(result.tool).toEqual({ id: 'tool-123', version: '2.5.0' });
    });
  });
});


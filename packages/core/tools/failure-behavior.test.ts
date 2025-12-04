import { ApiConfig, ExecutionStep, HttpMethod, Tool } from '@superglue/shared';
import { describe, expect, it } from 'vitest';
import { ToolExecutor } from './tool-executor.js';

describe('ToolExecutor - Failure Behavior', () => {

  describe('Loop Steps with FAIL behavior (default)', () => {
    it('should stop execution on first failure in loop', async () => {
      const mockApiConfig: ApiConfig = {
        id: 'test-api',
        urlHost: 'https://api.example.com',
        urlPath: '/test',
        method: HttpMethod.GET,
        instruction: 'Test endpoint that fails on second iteration',
      };

      const step: ExecutionStep = {
        id: 'testStep',
        apiConfig: mockApiConfig,
        loopSelector: '(sourceData) => [1, 2, 3]', // Will try 3 iterations
        failureBehavior: 'FAIL', // Explicit default
      };

      const tool: Tool = {
        id: 'test-tool',
        steps: [step],
        finalTransform: '(sourceData) => sourceData',
        integrationIds: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { traceId: 'test-trace', orgId: '' },
        integrations: [],
      });

      // Mock the strategy registry to fail on second iteration
      let callCount = 0;
      (executor as any).strategyRegistry = {
        routeAndExecute: async () => {
          callCount++;
          if (callCount === 2) {
            return { success: false, error: 'Simulated failure on iteration 2' };
          }
          return { success: true, strategyExecutionData: { result: `iteration ${callCount}` } };
        },
      };

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated failure');
      expect(callCount).toBe(2); // Should only reach 2nd iteration before failing
    });
  });

  describe('Loop Steps with CONTINUE behavior', () => {
    it('should continue execution through all iterations despite failures', async () => {
      const mockApiConfig: ApiConfig = {
        id: 'test-api',
        urlHost: 'https://api.example.com',
        urlPath: '/test',
        method: HttpMethod.GET,
        instruction: 'Test endpoint that fails on some iterations',
      };

      const step: ExecutionStep = {
        id: 'testStep',
        apiConfig: mockApiConfig,
        loopSelector: '(sourceData) => [1, 2, 3, 4, 5]',
        failureBehavior: 'CONTINUE',
      };

      const tool: Tool = {
        id: 'test-tool',
        steps: [step],
        finalTransform: '(sourceData) => sourceData',
        integrationIds: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { traceId: 'test-trace', orgId: '' },
        integrations: [],
      });

      // Mock the strategy registry to fail on iterations 2 and 4
      let callCount = 0;
      (executor as any).strategyRegistry = {
        routeAndExecute: async () => {
          callCount++;
          if (callCount === 2 || callCount === 4) {
            return { success: false, error: `Simulated failure on iteration ${callCount}` };
          }
          return { success: true, strategyExecutionData: { result: `success on iteration ${callCount}` } };
        },
      };

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      // Workflow should succeed overall
      expect(result.success).toBe(true);
      
      // Step should succeed
      const stepResult = result.stepResults[0];
      expect(stepResult.success).toBe(true);
      
      // All 5 iterations should be executed
      expect(callCount).toBe(5);
      
      // Check result structure - data should be array of objects with currentItem, data, and success
      expect(Array.isArray(stepResult.data)).toBe(true);
      expect(stepResult.data).toHaveLength(5);
      
      // Verify successful iterations
      expect(stepResult.data[0].success).toBe(true);
      expect(stepResult.data[0].data).toEqual({ result: 'success on iteration 1' });
      
      expect(stepResult.data[2].success).toBe(true);
      expect(stepResult.data[2].data).toEqual({ result: 'success on iteration 3' });
      
      expect(stepResult.data[4].success).toBe(true);
      expect(stepResult.data[4].data).toEqual({ result: 'success on iteration 5' });
      
      // Verify failed iterations
      expect(stepResult.data[1].success).toBe(false);
      expect(stepResult.data[1].data).toBe(null);
      expect(stepResult.data[1].error).toContain('Simulated failure on iteration 2');
      
      expect(stepResult.data[3].success).toBe(false);
      expect(stepResult.data[3].data).toBe(null);
      expect(stepResult.data[3].error).toContain('Simulated failure on iteration 4');
    });

    it('should include currentItem in both successful and failed iterations', async () => {
      const mockApiConfig: ApiConfig = {
        id: 'test-api',
        urlHost: 'https://api.example.com',
        urlPath: '/test',
        method: HttpMethod.GET,
        instruction: 'Test endpoint',
      };

      const step: ExecutionStep = {
        id: 'testStep',
        apiConfig: mockApiConfig,
        loopSelector: '(sourceData) => [{id: 1, name: "Alice"}, {id: 2, name: "Bob"}, {id: 3, name: "Charlie"}]',
        failureBehavior: 'CONTINUE',
      };

      const tool: Tool = {
        id: 'test-tool',
        steps: [step],
        finalTransform: '(sourceData) => sourceData',
        integrationIds: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { traceId: 'test-trace', orgId: '' },
        integrations: [],
      });

      let callCount = 0;
      (executor as any).strategyRegistry = {
        routeAndExecute: async () => {
          callCount++;
          if (callCount === 2) {
            return { success: false, error: 'Bob failed' };
          }
          return { success: true, strategyExecutionData: { processed: true } };
        },
      };

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(true);
      const stepResult = result.stepResults[0];
      
      // Check currentItem is preserved for all iterations
      expect(stepResult.data[0].currentItem).toEqual({id: 1, name: "Alice"});
      expect(stepResult.data[0].success).toBe(true);
      
      expect(stepResult.data[1].currentItem).toEqual({id: 2, name: "Bob"});
      expect(stepResult.data[1].success).toBe(false);
      expect(stepResult.data[1].error).toContain('Bob failed');
      
      expect(stepResult.data[2].currentItem).toEqual({id: 3, name: "Charlie"});
      expect(stepResult.data[2].success).toBe(true);
    });
  });

  describe('Direct Steps with CONTINUE behavior', () => {
    it('should mark step as successful even when execution fails', async () => {
      const mockApiConfig: ApiConfig = {
        id: 'test-api',
        urlHost: 'https://api.example.com',
        urlPath: '/test',
        method: HttpMethod.GET,
        instruction: 'Test endpoint that will fail',
      };

      const step: ExecutionStep = {
        id: 'testStep',
        apiConfig: mockApiConfig,
        loopSelector: '(sourceData) => ({})', // Returns object for direct execution
        failureBehavior: 'CONTINUE',
      };

      const tool: Tool = {
        id: 'test-tool',
        steps: [step],
        finalTransform: '(sourceData) => sourceData',
        integrationIds: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { traceId: 'test-trace', orgId: '' },
        integrations: [],
      });

      (executor as any).strategyRegistry = {
        routeAndExecute: async () => {
          return { success: false, error: 'Direct execution failed' };
        },
      };

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      // Workflow should succeed overall
      expect(result.success).toBe(true);
      
      // Step should succeed
      const stepResult = result.stepResults[0];
      expect(stepResult.success).toBe(true);
      
      // But data should indicate the failure
      expect(stepResult.data.success).toBe(false);
      expect(stepResult.data.data).toBe(null);
      expect(stepResult.data.error).toContain('Direct execution failed');
    });
  });

  describe('Multi-step workflows with mixed failure behaviors', () => {
    it('should continue workflow when first step has CONTINUE behavior and fails', async () => {
      const mockApiConfig1: ApiConfig = {
        id: 'test-api-1',
        urlHost: 'https://api.example.com',
        urlPath: '/test1',
        method: HttpMethod.GET,
        instruction: 'First step that may fail',
      };

      const mockApiConfig2: ApiConfig = {
        id: 'test-api-2',
        urlHost: 'https://api.example.com',
        urlPath: '/test2',
        method: HttpMethod.GET,
        instruction: 'Second step',
      };

      const step1: ExecutionStep = {
        id: 'step1',
        apiConfig: mockApiConfig1,
        loopSelector: '(sourceData) => ({})',
        failureBehavior: 'CONTINUE',
      };

      const step2: ExecutionStep = {
        id: 'step2',
        apiConfig: mockApiConfig2,
        loopSelector: '(sourceData) => ({})',
        failureBehavior: 'FAIL', // Default behavior
      };

      const tool: Tool = {
        id: 'test-tool',
        steps: [step1, step2],
        finalTransform: '(sourceData) => sourceData',
        integrationIds: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { traceId: 'test-trace', orgId: '' },
        integrations: [],
      });

      let stepExecuted = 0;
      (executor as any).strategyRegistry = {
        routeAndExecute: async () => {
          stepExecuted++;
          if (stepExecuted === 1) {
            return { success: false, error: 'Step 1 failed' };
          }
          return { success: true, strategyExecutionData: { result: 'step 2 success' } };
        },
      };

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      // Workflow should succeed
      expect(result.success).toBe(true);
      
      // Both steps should have executed
      expect(stepExecuted).toBe(2);
      expect(result.stepResults).toHaveLength(2);
      
      // Step 1 should succeed at step level but show failure in data
      expect(result.stepResults[0].success).toBe(true);
      expect(result.stepResults[0].data.success).toBe(false);
      
      // Step 2 should succeed normally
      expect(result.stepResults[1].success).toBe(true);
      expect(result.stepResults[1].data.success).toBe(true);
    });

    it('should stop workflow when step with FAIL behavior fails', async () => {
      const mockApiConfig1: ApiConfig = {
        id: 'test-api-1',
        urlHost: 'https://api.example.com',
        urlPath: '/test1',
        method: HttpMethod.GET,
        instruction: 'First step',
      };

      const mockApiConfig2: ApiConfig = {
        id: 'test-api-2',
        urlHost: 'https://api.example.com',
        urlPath: '/test2',
        method: HttpMethod.GET,
        instruction: 'Second step that will fail',
      };

      const step1: ExecutionStep = {
        id: 'step1',
        apiConfig: mockApiConfig1,
        loopSelector: '(sourceData) => ({})',
        failureBehavior: 'CONTINUE',
      };

      const step2: ExecutionStep = {
        id: 'step2',
        apiConfig: mockApiConfig2,
        loopSelector: '(sourceData) => ({})',
        failureBehavior: 'FAIL',
      };

      const tool: Tool = {
        id: 'test-tool',
        steps: [step1, step2],
        finalTransform: '(sourceData) => sourceData',
        integrationIds: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { traceId: 'test-trace', orgId: '' },
        integrations: [],
      });

      let stepExecuted = 0;
      (executor as any).strategyRegistry = {
        routeAndExecute: async () => {
          stepExecuted++;
          if (stepExecuted === 2) {
            return { success: false, error: 'Step 2 failed' };
          }
          return { success: true, strategyExecutionData: { result: 'success' } };
        },
      };

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      // Workflow should fail
      expect(result.success).toBe(false);
      expect(result.error).toContain('Step 2 failed');
      
      // Both steps should have executed
      expect(stepExecuted).toBe(2);
      expect(result.stepResults).toHaveLength(2);
    });
  });

  describe('Empty loops with CONTINUE behavior', () => {
    it('should handle empty loop arrays gracefully', async () => {
      const mockApiConfig: ApiConfig = {
        id: 'test-api',
        urlHost: 'https://api.example.com',
        urlPath: '/test',
        method: HttpMethod.GET,
        instruction: 'Test endpoint',
      };

      const step: ExecutionStep = {
        id: 'testStep',
        apiConfig: mockApiConfig,
        loopSelector: '(sourceData) => []', // Empty array
        failureBehavior: 'CONTINUE',
      };

      const tool: Tool = {
        id: 'test-tool',
        steps: [step],
        finalTransform: '(sourceData) => sourceData',
        integrationIds: [],
      };

      const executor = new ToolExecutor({
        tool,
        metadata: { traceId: 'test-trace', orgId: '' },
        integrations: [],
      });

      let callCount = 0;
      (executor as any).strategyRegistry = {
        routeAndExecute: async () => {
          callCount++;
          return { success: true, strategyExecutionData: { result: 'success' } };
        },
      };

      const result = await executor.execute({
        payload: {},
        credentials: {},
        options: {},
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(0); // No iterations should execute
      
      const stepResult = result.stepResults[0];
      expect(stepResult.success).toBe(true);
      expect(stepResult.data).toEqual([]);
    });
  });
});


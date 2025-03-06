import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvers } from '../graphql/graphql.js';
import { createTelemetryPlugin, extractOperationName, telemetryMiddleware } from './telemetry.js';

// Mock PostHog
vi.mock('posthog-node', async () => {
  return {
    PostHog: vi.fn().mockImplementation(() => ({
      capture: vi.fn(),
      captureException: vi.fn()
    }))
  };
});

describe('Telemetry Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractOperationName', () => {
    it('extracts operation name from call mutation with variables', () => {
      const query = `
        mutation CallApi($input: ApiInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions) {
          call(input: $input, payload: $payload, credentials: $credentials, options: $options) {
            id
            success
          }
        }
      `;
      expect(extractOperationName(query)).toBe('call');
    });
  });

  describe('telemetry middleware', () => {
    it('tracks call operation properly', () => {
      const mockReq = {
        body: {
          query: `
            mutation {
              call(input: { id: "123" }, payload: {}) {
                id
                success
              }
            }
          `
        },
        orgId: 'test-org'
      };
      const mockRes = {};
      const mockNext = vi.fn();

      telemetryMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('telemetry plugin', () => {
    it('creates plugin with handler', () => {
      const plugin = createTelemetryPlugin();
      expect(plugin).toHaveProperty('requestDidStart');
    });
  });

  it('verifies call operation exists in schema TRACKING BROKEN IF FAILS', () => {
    // Get mutation operations defined in resolvers
    const mutationOperations = Object.keys(resolvers.Mutation);
    
    // Verify the call operation exists
    expect(mutationOperations).toContain('call');
  });
}); 

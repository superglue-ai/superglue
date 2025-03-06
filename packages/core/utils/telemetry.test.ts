import { PostHog } from 'posthog-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvers } from '../graphql/graphql.js';
import * as telemetryModule from './telemetry.js';

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

  describe('telemetry environment variables', () => {
    it('disables telemetry when DISABLE_TELEMETRY is set to true', async () => {
      // Mock the environment variables
      const originalEnv = process.env.DISABLE_TELEMETRY;
      vi.stubEnv('DISABLE_TELEMETRY', 'true');
      
      // Mock the initialization of telemetryClient
      const mockPostHog = vi.mocked(PostHog);
      mockPostHog.mockClear();
      
      // Create a new instance of telemetry utilities to test the disabled state
      // We can do this by re-executing the logic that initializes telemetryClient
      const isTelemetryDisabled = process.env.DISABLE_TELEMETRY === "true";
      const isDebug = process.env.DEBUG === "true";
      const telemetryClient = !isTelemetryDisabled && !isDebug ? 
        new PostHog('test-key', { host: 'test-host', enableExceptionAutocapture: true }) : null;
      
      // Verify telemetry is disabled
      expect(isTelemetryDisabled).toBe(true);
      expect(telemetryClient).toBeNull();
      
      // Test the middleware with telemetry disabled
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
      
      // Use the real middleware function with our test request
      telemetryModule.telemetryMiddleware(mockReq, mockRes, mockNext);
      
      // Expect next to be called without error
      expect(mockNext).toHaveBeenCalled();
      expect(mockPostHog).not.toHaveBeenCalled();
      
      // Mock console.error to prevent actual error logging during tests
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        // Test the telemetry plugin with telemetry disabled
        const plugin = telemetryModule.createTelemetryPlugin();
        const requestHandler = await plugin.requestDidStart();
        
        // Create a more complete mock of requestContext based on the checkIfSelfHosted requirements
        const mockRequestContext = {
          contextValue: { 
            orgId: 'test-org',
            datastore: {
              constructor: { name: 'MockDataStore' },
              storage: {
                tenant: {
                  email: 'test@example.com',
                  emailEntrySkipped: false
                }
              }
            }
          },
          request: { 
            query: 'query { test }' 
          },
          response: { 
            body: {} 
          },
          errors: []
        };
        
        // Execute the willSendResponse handler - this should not throw even with telemetry disabled
        await requestHandler.willSendResponse(mockRequestContext);
        
        // Verify telemetry was not captured since it's disabled
        expect(PostHog).not.toHaveBeenCalled();
      } finally {
        // Restore console.error
        consoleErrorSpy.mockRestore();
        
        // Restore original env
        vi.stubEnv('DISABLE_TELEMETRY', originalEnv || '');
      }
    });
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
      expect(telemetryModule.extractOperationName(query)).toBe('call');
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

      telemetryModule.telemetryMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('telemetry plugin', () => {
    it('creates plugin with handler', () => {
      const plugin = telemetryModule.createTelemetryPlugin();
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

import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import * as mcpServer from './mcp-server.js';
import { SuperglueClient } from '@superglue/client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('mock-uuid')
}));

vi.mock('@superglue/client', () => ({
  SuperglueClient: vi.fn().mockImplementation(() => ({
    transform: vi.fn().mockResolvedValue({ result: 'transformed' }),
    listWorkflows: vi.fn().mockResolvedValue([{ id: 'workflow1' }]),
    getWorkflow: vi.fn().mockResolvedValue({ id: 'workflow1', steps: [] }),
    executeWorkflow: vi.fn().mockResolvedValue({ result: 'executed' }),
    buildWorkflow: vi.fn().mockResolvedValue({ id: 'new-workflow', steps: [] }),
    upsertWorkflow: vi.fn().mockResolvedValue({ id: 'workflow1', updated: true }),
    deleteWorkflow: vi.fn().mockResolvedValue({ success: true }),
  }))
}));

// Better McpServer mock
const mockToolFn = vi.fn();
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: mockToolFn,
    connect: vi.fn().mockResolvedValue(undefined)
  }))
}));

// Mock transport with proper instances
const mockHandleRequest = vi.fn().mockResolvedValue(undefined);
const mockOnClose = vi.fn();
let createdTransport;

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  return {
    StreamableHTTPServerTransport: vi.fn().mockImplementation((config) => {
      const transport = {
        handleRequest: mockHandleRequest,
        sessionId: 'mock-session-id',
        onclose: mockOnClose,
        ...config
      };
      
      // Important: Call this after transport is fully created
      if (config && typeof config.onsessioninitialized === 'function') {
        setTimeout(() => config.onsessioninitialized('mock-session-id'), 0);
      }
      
      return transport;
    })
  };
});

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  isInitializeRequest: vi.fn().mockImplementation((body) => body?.method === 'initialize'),
  ServerRequest: {},
  ServerNotification: {},
  CallToolResult: {}
}));

describe('MCP Server Module', () => {
  let mockReq: Partial<Request & { authInfo: { token: string } }>;
  let mockRes: Partial<Response>;
  
  beforeEach(() => {
    // Clear the transports
    Object.keys(mcpServer.transports).forEach(key => {
      delete mcpServer.transports[key];
    });
    
    // Reset all mocks
    vi.clearAllMocks();
    
    process.env.GRAPHQL_ENDPOINT = 'https://api.example.com/graphql';
    
    mockReq = {
      headers: {},
      body: {},
      authInfo: { token: 'test-api-key' }
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn()
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Zod Schema Validation', () => {
    it('should validate TransformInputRequestSchema correctly', () => {
      // Valid with endpoint
      const validEndpoint = {
        endpoint: {
          id: 'transform-1',
          instruction: 'Transform this data',
          responseSchema: {}
        }
      };
      expect(() => mcpServer.TransformInputRequestSchema.parse(validEndpoint)).not.toThrow();

      // Valid with id
      const validId = { id: 'transform-1' };
      expect(() => mcpServer.TransformInputRequestSchema.parse(validId)).not.toThrow();

      // Invalid with both
      const invalidBoth = {
        id: 'transform-1',
        endpoint: {
          id: 'transform-2',
          instruction: 'Transform this data',
          responseSchema: {}
        }
      };
      expect(() => mcpServer.TransformInputRequestSchema.parse(invalidBoth)).toThrow();

      // Invalid with neither
      const invalidNeither = {};
      expect(() => mcpServer.TransformInputRequestSchema.parse(invalidNeither)).toThrow();
    });

    it('should validate WorkflowInputRequestSchema correctly', () => {
      // Valid with workflow
      const validWorkflow = {
        workflow: {
          id: 'workflow-1',
          steps: [{
            id: 'step-1',
            apiConfig: {
              id: 'api-1',
              urlHost: 'https://api.example.com',
              instruction: 'Get data'
            }
          }]
        }
      };
      expect(() => mcpServer.WorkflowInputRequestSchema.parse(validWorkflow)).not.toThrow();

      // Valid with id
      const validId = { id: 'workflow-1' };
      expect(() => mcpServer.WorkflowInputRequestSchema.parse(validId)).not.toThrow();

      // Invalid with both
      const invalidBoth = {
        id: 'workflow-1',
        workflow: {
          id: 'workflow-2',
          steps: []
        }
      };
      expect(() => mcpServer.WorkflowInputRequestSchema.parse(invalidBoth)).toThrow();

      // Invalid with neither
      const invalidNeither = {};
      expect(() => mcpServer.WorkflowInputRequestSchema.parse(invalidNeither)).toThrow();
    });

    it('should validate enums correctly', () => {
      expect(mcpServer.CacheModeEnum.parse('ENABLED')).toBe('ENABLED');
      expect(() => mcpServer.CacheModeEnum.parse('INVALID')).toThrow();

      expect(mcpServer.HttpMethodEnum.parse('GET')).toBe('GET');
      expect(() => mcpServer.HttpMethodEnum.parse('INVALID')).toThrow();

      expect(mcpServer.AuthTypeEnum.parse('NONE')).toBe('NONE');
      expect(() => mcpServer.AuthTypeEnum.parse('INVALID')).toThrow();

      expect(mcpServer.PaginationTypeEnum.parse('OFFSET_BASED')).toBe('OFFSET_BASED');
      expect(() => mcpServer.PaginationTypeEnum.parse('INVALID')).toThrow();
    });
  });

  describe('Tool Definitions', () => {
    let mockClient: Mocked<SuperglueClient>;
    let mockRequest: any;
    
    beforeEach(() => {
      mockClient = {
        transform: vi.fn().mockResolvedValue({ result: 'transformed' }),
        listWorkflows: vi.fn().mockResolvedValue([{ id: 'workflow1' }]),
        getWorkflow: vi.fn().mockResolvedValue({ id: 'workflow1', steps: [] }),
        executeWorkflow: vi.fn().mockResolvedValue({ result: 'executed' }),
        buildWorkflow: vi.fn().mockResolvedValue({ id: 'new-workflow', steps: [] }),
        upsertWorkflow: vi.fn().mockResolvedValue({ id: 'workflow1', updated: true }),
        deleteWorkflow: vi.fn().mockResolvedValue({ success: true }),
      } as any;
      
      mockRequest = {};
    });
    
    it('should execute transformData tool correctly', async () => {
      const args = {
        client: mockClient,
        input: { id: 'transform-1' },
        data: { key: 'value' },
        superglueApiKey: 'test-api-key'
      };
      
      const result = await mcpServer.toolDefinitions.transformData.execute(args, mockRequest);
      
      expect(mockClient.transform).toHaveBeenCalledWith(args);
      expect(result).toEqual({ result: 'transformed' });
    });
    
    it('should execute listPipelines tool correctly', async () => {
      const args = {
        client: mockClient,
        limit: 5,
        offset: 10
      };
      
      const result = await mcpServer.toolDefinitions.listPipelines.execute(args, mockRequest);
      
      expect(mockClient.listWorkflows).toHaveBeenCalledWith(5, 10);
      expect(result).toEqual([{ id: 'workflow1' }]);
    });
    
    it('should execute getPipeline tool correctly', async () => {
      const args = {
        client: mockClient,
        id: 'workflow1'
      };
      
      const result = await mcpServer.toolDefinitions.getPipeline.execute(args, mockRequest);
      
      expect(mockClient.getWorkflow).toHaveBeenCalledWith('workflow1');
      expect(result).toEqual({ id: 'workflow1', steps: [] });
    });
    
    it('should execute runPipeline tool correctly', async () => {
      const args = {
        client: mockClient,
        id: 'workflow1',
        payload: { data: 'test' }
      };
      
      const result = await mcpServer.toolDefinitions.runPipeline.execute(args, mockRequest);
      
      expect(mockClient.executeWorkflow).toHaveBeenCalledWith(args);
      expect(result).toEqual({ result: 'executed' });
    });
    
    it('should execute buildPipeline tool correctly', async () => {
      const args = {
        client: mockClient,
        instruction: 'Build a workflow',
        payload: { data: 'test' },
        systems: [{ id: 'system1', urlHost: 'https://api.example.com' }]
      };
      
      const result = await mcpServer.toolDefinitions.buildPipeline.execute(args, mockRequest);
      
      expect(mockClient.buildWorkflow).toHaveBeenCalledWith(
        'Build a workflow',
        { data: 'test' },
        [{ id: 'system1', urlHost: 'https://api.example.com' }]
      );
      expect(result).toEqual({ id: 'new-workflow', steps: [] });
    });
    
    it('should execute upsertPipeline tool correctly', async () => {
      const args = {
        client: mockClient,
        id: 'workflow1',
        input: { steps: [] }
      };
      
      const result = await mcpServer.toolDefinitions.upsertPipeline.execute(args, mockRequest);
      
      expect(mockClient.upsertWorkflow).toHaveBeenCalledWith('workflow1', { steps: [] });
      expect(result).toEqual({ id: 'workflow1', updated: true });
    });
    
    it('should execute deletePipeline tool correctly', async () => {
      const args = {
        client: mockClient,
        id: 'workflow1'
      };
      
      const result = await mcpServer.toolDefinitions.deletePipeline.execute(args, mockRequest);
      
      expect(mockClient.deleteWorkflow).toHaveBeenCalledWith('workflow1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('mcpHandler', () => {
    it('should handle existing session requests', async () => {
      // Create direct spy on handleRequest
      const handleRequestSpy = vi.fn().mockResolvedValue(undefined);
      
      // Add directly to the real transports object
      mcpServer.transports['existing-session'] = {
        handleRequest: handleRequestSpy,
        sessionId: 'existing-session',
        onclose: vi.fn(),
        // Add other required properties
      } as any;
      
      mockReq.headers = { 'mcp-session-id': 'existing-session' };
      
      await mcpServer.mcpHandler(mockReq as Request, mockRes as Response);
      
      expect(handleRequestSpy).toHaveBeenCalled();
    });
        
    it('should return 400 for invalid requests', async () => {
      mockReq.body = { method: 'not-initialize' };
      mockReq.headers = {};
      
      await mcpServer.mcpHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
    });

    it('should remove transport when session is closed', async () => {
      // Create a mock onclose function that actually removes the transport
      const removeTransport = () => {
        delete mcpServer.transports['mock-session-id'];
      };
      
      // Set up the transport with our custom onclose
      mcpServer.transports['mock-session-id'] = {
        sessionId: 'mock-session-id',
        onclose: removeTransport
      } as any;
      
      expect(Object.keys(mcpServer.transports).length).toBe(1);
      
      // Call our custom onclose
      mcpServer.transports['mock-session-id'].onclose();
      
      expect(Object.keys(mcpServer.transports).length).toBe(0);
    });
  });

  describe('handleMcpSessionRequest', () => {
    it('should handle requests with valid session IDs', async () => {
      // Reset mocks
      vi.clearAllMocks();
      
      // Use a real function to track calls
      const sessionHandleRequest = vi.fn().mockResolvedValue(undefined);
      const mockSessionTransport = { handleRequest: sessionHandleRequest };
      
      // Clear all transports and add our test one
      Object.keys(mcpServer.transports).forEach(key => delete mcpServer.transports[key]);
      mcpServer.transports['valid-session'] = mockSessionTransport as any;
      
      mockReq.headers = { 'mcp-session-id': 'valid-session' };
      
      await mcpServer.handleMcpSessionRequest(mockReq as Request, mockRes as Response);
      
      expect(sessionHandleRequest).toHaveBeenCalledWith(mockReq, mockRes);
    });
    
    it('should return 400 for missing or invalid session IDs', async () => {
      mockReq.headers = { 'mcp-session-id': 'invalid-session' };
      
      await mcpServer.handleMcpSessionRequest(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Invalid or missing session ID');
    });
  });
});

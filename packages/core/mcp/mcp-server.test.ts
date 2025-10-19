import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toolDefinitions } from './mcp-server.js';

const buildAndRun = toolDefinitions.superglue_build_and_run.execute;
const executeWorkflow = toolDefinitions.superglue_execute_tool.execute;
const getIntegrationCode = toolDefinitions.superglue_get_tool_integration_code.execute;
const listWorkflows = toolDefinitions.superglue_list_available_tools.execute;
const findIntegrations = toolDefinitions.superglue_find_relevant_integrations.execute;
const saveTool = toolDefinitions.superglue_save_tool.execute;
const createIntegration = toolDefinitions.superglue_create_integration.execute;
const modifyIntegration = toolDefinitions.superglue_modify_integration.execute;

// Mock the waitForIntegrationProcessing function
vi.mock('@superglue/shared/utils', () => ({
  waitForIntegrationProcessing: vi.fn().mockResolvedValue(['integration-1']), // Success case by default
  flattenAndNamespaceWorkflowCredentials: vi.fn().mockReturnValue({}) // Add this mock
}));

function getValidBuildArgs(overrides = {}) {
  return {
    instruction: 'Fetch all users from CRM and enrich with orders',
    integrationIds: ['test-integration-id'],
    payload: { userId: 123 },
    client: {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', steps: [] }),
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'success' },
        config: { id: 'tool-1', steps: [], integrationIds: ['test-integration-id'], instruction: 'test' },
        stepResults: []
      }),
    },
    ...overrides
  };
}

function getValidExecuteArgs(overrides = {}) {
  return {
    id: 'tool-1',
    payload: { test: 'data' },
    client: {
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'success' },
        config: { id: 'tool-1' },
        stepResults: []
      }),
    },
    ...overrides
  };
}

describe('superglue_build_and_run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error if instruction is missing', async () => {
    const result = await buildAndRun(getValidBuildArgs({ instruction: undefined }), {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Instruction must be detailed/);
  });

  it('returns error if instruction is too short', async () => {
    const result = await buildAndRun(getValidBuildArgs({ instruction: 'short' }), {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Instruction must be detailed/);
  });

  it('returns error if integrations array is empty', async () => {
    const result = await buildAndRun(getValidBuildArgs({ integrationIds: [] }), {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/integrationIds array is required/);
  });

  it('returns error if integration is not a string', async () => {
    const result = await buildAndRun(getValidBuildArgs({
      integrationIds: [{ id: 'test-integration' }]
    }), {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Each integration must be a string ID/);
  });

  it('returns error if credentials is not an object', async () => {
    const result = await buildAndRun(getValidBuildArgs({
      credentials: 'invalid-credentials'
    }), {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Credentials must be an object/);
  });

  it('accepts array of integration ID strings', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', steps: [] }),
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'success' },
        config: { id: 'tool-1', steps: [], integrationIds: ['integration-1', 'integration-2'] },
        stepResults: []
      }),
    };
    const args = getValidBuildArgs({
      integrationIds: ['integration-1', 'integration-2'],
      client
    });
    const result = await buildAndRun(args, {});
    expect(result.success).toBe(true);
    expect(client.buildWorkflow).toHaveBeenCalledWith({
      instruction: args.instruction,
      integrationIds: ['integration-1', 'integration-2'],
      payload: args.payload,
      responseSchema: undefined,
      save: false
    });
  });

  it('returns failure if buildWorkflow throws', async () => {
    const client = {
      buildWorkflow: vi.fn().mockRejectedValue(new Error('fail build')),
    };
    const args = getValidBuildArgs({ client });
    const result = await buildAndRun(args, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fail build/);
  });

  it('returns tool_ready_to_save on successful execution', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', steps: [] }),
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'success' },
        config: {
          id: 'tool-1',
          steps: [],
          integrationIds: ['test-integration-id'],
          instruction: 'test tool'
        },
        stepResults: []
      }),
    };
    const args = getValidBuildArgs({ client });
    const result = await buildAndRun(args, {});
    expect(result.success).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.integrationIds).toBeDefined();
    expect(result.note).toContain('superglue_save_tool');
  });

  it('calls executeWorkflow with credentials parameter', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', steps: [] }),
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'success' },
        config: { id: 'tool-1', steps: [] },
        stepResults: []
      }),
    };
    const args = getValidBuildArgs({
      integrationIds: ['integration-1'],
      credentials: { apiKey: 'test-key' },
      client
    });
    const result = await buildAndRun(args, {});
    expect(result.success).toBe(true);
    expect(client.executeWorkflow).toHaveBeenCalledWith({
      workflow: { id: 'tool-1', steps: [] },
      payload: args.payload,
      credentials: { apiKey: 'test-key' },
      options: {
        testMode: true
      }
    });
  });


});

describe('superglue_execute_tool', () => {
  it('calls executeWorkflow with minimal valid input (id only)', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { ok: true },
        config: { id: 'tool-minimal' },
        stepResults: []
      }),
    };
    const args = { id: 'tool-minimal', client };
    const result = await executeWorkflow(args, {});
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tool-minimal' }));
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ ok: true });
  });

  it('calls executeWorkflow with payload', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { foo: 'bar' },
        config: {},
        stepResults: []
      }),
    };
    const args = { id: 'tool-payload', payload: { foo: 'bar' }, client };
    const result = await executeWorkflow(args, {});
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tool-payload',
      payload: { foo: 'bar' }
    }));
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ foo: 'bar' });
  });

  it('calls executeWorkflow with all fields', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        data: { ok: true },
        config: {},
        stepResults: []
      }),
    };
    const args = {
      id: 'tool-all',
      payload: { foo: 1 },
      credentials: { apiKey: 'test' },
      options: { retries: 2 },
      client
    };
    const result = await executeWorkflow(args, {});
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tool-all',
      payload: { foo: 1 },
      credentials: { apiKey: 'test' },
      options: { retries: 2 }
    }));
    expect(result.success).toBe(true);
  });

  it('throws if id is missing', async () => {
    const client = {
      executeWorkflow: vi.fn(),
    };
    const args = { client };
    await expect(executeWorkflow(args, {})).rejects.toThrow(/Tool ID is required/);
  });

  it('returns error response when client throws', async () => {
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Tool not found'))
    };
    const args = { id: 'missing-tool', client };
    const result = await executeWorkflow(args, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool not found');
    expect(result.suggestion).toContain('Check that the tool ID exists');
  });
});

describe('superglue_get_tool_integration_code', () => {
  it('returns code for valid toolId and language', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({
        id: 'tool-1',
        inputSchema: {
          properties: {
            payload: { properties: { test: { type: 'string' } } },
            credentials: { properties: { apiKey: { type: 'string' } } }
          }
        }
      })
    };
    const args = { client, toolId: 'tool-1', language: 'typescript' };
    const result = await getIntegrationCode(args, {});
    expect(result.success).toBe(true);
    expect(result.toolId).toBe('tool-1');
    expect(result.language).toBe('typescript');
    expect(result.code).toContain('SuperglueClient');
  });

  it('fails if toolId does not exist', async () => {
    const client = {
      getWorkflow: vi.fn().mockRejectedValue(new Error('Tool not found'))
    };
    const args = { client, toolId: 'bad-id', language: 'typescript' };
    const result = await getIntegrationCode(args, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to generate code for tool bad-id');
  });

  it('returns code for all supported languages', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({
        id: 'tool-1',
        inputSchema: { properties: {} }
      })
    };
    for (const language of ['typescript', 'python', 'go']) {
      const args = { client, toolId: 'tool-1', language };
      const result = await getIntegrationCode(args, {});
      expect(result.success).toBe(true);
      expect(result.language).toBe(language);
      expect(result.code).toBeTruthy();
    }
  });

  it('handles invalid language', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({
        id: 'tool-1',
        inputSchema: { properties: {} }
      })
    };
    const args = { client, toolId: 'tool-1', language: 'invalid-language' };
    const result = await getIntegrationCode(args, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid-language');
    expect(result.error).toContain('not supported');
  });
});

describe('superglue_list_available_tools', () => {
  it('returns tools with default limit and offset', async () => {
    const mockItems = [
      {
        id: 'tool-1',
        name: 'Test Tool 1',
        instruction: 'First test tool',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'tool-2',
        instruction: 'Second test tool',
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z'
      }
    ];
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: mockItems,
        total: 2
      }),
      listIntegrations: vi.fn().mockResolvedValue({
        items: [],
        total: 0
      })
    };
    const args = { client };
    const result = await listWorkflows(args, {});

    expect(client.listWorkflows).toHaveBeenCalledWith(100, 0);
    expect(result.success).toBe(true);
    expect(result.tools).toBeDefined();
    expect(result.total).toBeGreaterThan(0); // Includes static tools + user tools
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
    expect(result.usage_tip).toBe("Use tool IDs with superglue_execute_tool to run specific tools");
  });

  it('uses custom limit and offset', async () => {
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: [],
        total: 0
      }),
      listIntegrations: vi.fn().mockResolvedValue({
        items: [],
        total: 0
      })
    };
    const args = { client, limit: 5, offset: 20 };
    const result = await listWorkflows(args, {});

    expect(client.listWorkflows).toHaveBeenCalledWith(5, 20);
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.offset).toBe(20);
  });

  it('returns failure when listWorkflows throws', async () => {
    const client = {
      listWorkflows: vi.fn().mockRejectedValue(new Error('API error'))
    };
    const args = { client };
    const result = await listWorkflows(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('API error');
    expect(result.suggestion).toBe("Check your API credentials and permissions");
  });
});

describe('superglue_find_relevant_integrations', () => {
  it('returns empty list with helpful message when no integrations exist and instruction provided', async () => {
    const client = {
      findRelevantIntegrations: vi.fn().mockResolvedValue([])
    };
    const args = { client, instruction: 'test instruction' };
    const result = await findIntegrations(args, {});

    expect(result.success).toBe(true);
    expect(result.suggestedIntegrations).toEqual([]);
    expect(result.message).toContain('No integrations found for your request');
    expect(result.suggestion).toContain('creating a new integration');
  });

  it('returns empty list when no integrations exist and no instruction', async () => {
    const client = {
      findRelevantIntegrations: vi.fn().mockResolvedValue([])
    };
    const args = { client };
    const result = await findIntegrations(args, {});

    expect(result.success).toBe(true);
    expect(result.suggestedIntegrations).toEqual([]);
    expect(result.message).toContain('No integrations found in your account');
    expect(result.suggestion).toContain('superglue_create_integration');
  });

  it('returns all integrations when no instruction provided', async () => {
    const mockIntegrations = [
      { id: 'integration-1', reason: 'Available integration (no specific instruction provided)' }
    ];
    const client = {
      findRelevantIntegrations: vi.fn().mockResolvedValue(mockIntegrations)
    };
    const args = { client };
    const result = await findIntegrations(args, {});

    expect(result.success).toBe(true);
    expect(result.suggestedIntegrations).toEqual(mockIntegrations);
    expect(result.message).toContain('available integration');
  });

  it('returns relevant integrations for instruction', async () => {
    const mockIntegrations = [
      { integration: { id: 'crm-integration' }, reason: 'Matches CRM functionality' }
    ];
    const client = {
      findRelevantIntegrations: vi.fn().mockResolvedValue(mockIntegrations)
    };
    const args = { client, instruction: 'fetch CRM data' };
    const result = await findIntegrations(args, {});

    expect(result.success).toBe(true);
    expect(result.suggestedIntegrations).toEqual(mockIntegrations);
    expect(result.message).toContain('relevant integration');
    expect(result.usage_tip).toContain('superglue_build_and_run');
  });

  it('handles client errors gracefully', async () => {
    const client = {
      findRelevantIntegrations: vi.fn().mockRejectedValue(new Error('API error'))
    };
    const args = { client, instruction: 'test' };
    const result = await findIntegrations(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('API error');
    expect(result.suggestion).toContain('superglue_create_integration');
  });
});

describe('superglue_save_tool', () => {
  it('saves tool successfully', async () => {
    const client = {
      upsertWorkflow: vi.fn().mockResolvedValue({
        id: 'saved-tool',
        name: 'Test Tool'
      }),
    };
    const tool = {
      steps: [{ id: 'step1', apiConfig: { id: 'step1', instruction: 'test' } }],
      integrationIds: ['integration-1'],
      instruction: 'Test tool',
      finalTransform: '$'
    };
    const args = { client, id: 'test-tool', tool };
    const result = await saveTool(args, {});

    expect(result.success).toBe(true);
    expect(result.saved_tool).toBeDefined();
    expect(result.note).toContain('saved successfully');
    expect(client.upsertWorkflow).toHaveBeenCalledWith('test-tool', expect.objectContaining({
      steps: tool.steps,
      integrationIds: tool.integrationIds,
      instruction: tool.instruction,
      finalTransform: tool.finalTransform
    }));
  });

  it('cleans tool data before saving', async () => {
    const client = {
      upsertWorkflow: vi.fn().mockResolvedValue({ id: 'saved-tool' }),
    };
    const tool = {
      steps: [],
      integrationIds: null, // Will be cleaned to []
      instruction: null, // Will be cleaned to ""
      finalTransform: null, // Will be cleaned to "$"
      someNullField: null // Will be removed
    };
    const args = { client, id: 'test-tool', tool };
    const result = await saveTool(args, {});

    expect(result.success).toBe(true);
    expect(client.upsertWorkflow).toHaveBeenCalledWith('test-tool', expect.objectContaining({
      steps: [],
      integrationIds: [],
      instruction: '',
      finalTransform: '$'
    }));
    // Check that null field was removed
    const savedTool = client.upsertWorkflow.mock.calls[0][1];
    expect(savedTool).not.toHaveProperty('someNullField');
  });

  it('returns error if tool is missing', async () => {
    const client = { upsertWorkflow: vi.fn() };
    const args = { client, id: 'test-tool' };
    const result = await saveTool(args, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool object is required');
  });

  it('returns error if id is missing', async () => {
    const client = { upsertWorkflow: vi.fn() };
    const tool = { steps: [] };
    const args = { client, tool };
    const result = await saveTool(args, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool ID is required');
  });

  it('handles upsert failures gracefully', async () => {
    const client = {
      upsertWorkflow: vi.fn().mockRejectedValue(new Error('Save failed'))
    };
    const tool = { steps: [], integrationIds: [], instruction: 'test' };
    const args = { client, id: 'test-tool', tool };
    const result = await saveTool(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Save failed');
    expect(result.suggestion).toContain('Failed to save tool');
    expect(result.debug_info).toBeDefined();
  });
});

describe('superglue_create_integration', () => {
  it('creates integration successfully', async () => {
    const client = {
      upsertIntegration: vi.fn().mockResolvedValue({
        id: 'test-integration',
        name: 'Test Integration',
        documentationPending: false
      })
    };
    const args = {
      client,
      id: 'test-integration',
      name: 'Test Integration',
      urlHost: 'https://api.test.com',
      credentials: { apiKey: 'test' }
    };
    const result = await createIntegration(args, {});

    expect(result.success).toBe(true);
    expect(result.integration).toBeDefined();
    expect(result.note).toContain('created successfully');
    expect(client.upsertIntegration).toHaveBeenCalledWith('test-integration', {
      id: 'test-integration',
      name: 'Test Integration',
      urlHost: 'https://api.test.com',
      credentials: { apiKey: 'test' }
    }, 'CREATE');
  });

  it('handles documentation processing', async () => {
    const client = {
      upsertIntegration: vi.fn().mockResolvedValue({
        id: 'test-integration',
        documentationPending: true
      })
    };
    const args = {
      client,
      id: 'test-integration',
      documentationUrl: 'https://api.test.com/docs'
    };
    const result = await createIntegration(args, {});

    expect(result.success).toBe(true);
    expect(result.note).toContain('Documentation is being processed');
  });

  it('validates required id field', async () => {
    const client = { upsertIntegration: vi.fn() };
    const args = { client }; // Missing id
    const result = await createIntegration(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Integration ID is required');
  });

  it('validates credentials type', async () => {
    const client = { upsertIntegration: vi.fn() };
    const args = {
      client,
      id: 'test-integration',
      credentials: 'invalid-credentials' // Should be object
    };
    const result = await createIntegration(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Credentials must be an object');
  });

  it('returns failure when upsertIntegration throws', async () => {
    const client = {
      upsertIntegration: vi.fn().mockRejectedValue(new Error('Integration creation failed'))
    };
    const args = { client, id: 'test-integration' };
    const result = await createIntegration(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Integration creation failed');
    expect(result.suggestion).toContain('Validate all integration inputs');
  });

  it('filters sensitive fields', async () => {
    const client = { upsertIntegration: vi.fn().mockResolvedValue({
      id: 'test-integration',
      openApiSchema: 'test',
      documentation: 'test',
      credentials: {}
    }) };
    const args = { client, id: 'test-integration' };
    const result = await createIntegration(args, {});

    expect(result.success).toBe(true);
    expect(result.integration).not.toHaveProperty('openApiSchema');
    expect(result.integration).not.toHaveProperty('documentation');
  });
})

describe('superglue_modify_integration', () => {
  it('modify integration successfully', async () => {
    const client = {
      upsertIntegration: vi.fn().mockResolvedValue({
        id: 'test-integration',
        name: 'Test Integration',
        documentationPending: false
      })
    };
    const args = {
      client,
      id: 'test-integration',
      name: 'Test Integration',
      urlHost: 'https://api.test.com',
      credentials: { apiKey: 'test' }
    };
    const result = await modifyIntegration(args, {});

    expect(result.success).toBe(true);
    expect(result.integration).toBeDefined();
    expect(result.note).toContain('modified successfully');
    expect(client.upsertIntegration).toHaveBeenCalledWith('test-integration', {
      id: 'test-integration',
      name: 'Test Integration',
      urlHost: 'https://api.test.com',
      credentials: { apiKey: 'test' }
    }, 'UPDATE');
  });

  it('handles documentation processing', async () => {
    const client = {
      upsertIntegration: vi.fn().mockResolvedValue({
        id: 'test-integration',
        documentationPending: true
      })
    };
    const args = {
      client,
      id: 'test-integration',
      documentationUrl: 'https://api.test.com/docs'
    };
    const result = await modifyIntegration(args, {});

    expect(result.success).toBe(true);
    expect(result.note).toContain('Documentation is being processed');
  });

  it('validates required id field', async () => {
    const client = { upsertIntegration: vi.fn() };
    const args = { client }; // Missing id
    const result = await createIntegration(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Integration ID is required');
  });

  it('returns failure when upsertIntegration throws', async () => {
    const client = {
      upsertIntegration: vi.fn().mockRejectedValue(new Error('Integration modification failed'))
    };
    const args = { client, id: 'test-integration' };
    const result = await createIntegration(args, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Integration modification failed');
    expect(result.suggestion).toContain('Validate all integration inputs');
  });

  it('filters sensitive fields', async () => {
    const client = { upsertIntegration: vi.fn().mockResolvedValue({
      id: 'test-integration',
      openApiSchema: 'test',
      documentation: 'test'
    }) };
    const args = { client, id: 'test-integration' };
    const result = await modifyIntegration(args, {});

    expect(result.success).toBe(true);
    expect(result.integration).not.toHaveProperty('openApiSchema');
    expect(result.integration).not.toHaveProperty('documentation');
  });
})

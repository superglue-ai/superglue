import { describe, expect, it, vi } from 'vitest'
import { toolDefinitions } from './mcp-server.js'

const buildAndRun = toolDefinitions.superglue_build_and_run.execute
const executeWorkflow = toolDefinitions.superglue_execute_workflow.execute
const getIntegrationCode = toolDefinitions.superglue_get_workflow_integration_code.execute
const listWorkflows = toolDefinitions.superglue_list_available_workflows.execute
const findIntegrations = toolDefinitions.superglue_find_relevant_integrations.execute
const saveWorkflow = toolDefinitions.superglue_save_workflow.execute
const createIntegration = toolDefinitions.superglue_create_integration.execute

function getValidBuildArgs(overrides = {}) {
  return {
    instruction: 'Fetch all users from CRM and enrich with orders',
    integrations: ['test-integration-id'],
    payload: { userId: 123 },
    client: {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1', foo: 'bar' }),
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { result: 'success' }, config: { id: 'workflow-1' }, stepResults: [] }),
    },
    ...overrides
  }
}

function getValidExecuteArgs(overrides = {}) {
  return {
    id: 'workflow-1',
    payload: { test: 'data' },
    client: {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { result: 'success' }, config: { id: 'workflow-1' }, stepResults: [] }),
    },
    ...overrides
  }
}

describe('superglue_build_and_run', () => {
  it('returns error if instruction is missing', async () => {
    const result = await buildAndRun(getValidBuildArgs({ instruction: undefined }), {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Instruction must be detailed/)
  })

  it('returns error if instruction is too short', async () => {
    const result = await buildAndRun(getValidBuildArgs({ instruction: 'short' }), {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Instruction must be detailed/)
  })

  it('returns error if integrations array is empty', async () => {
    const result = await buildAndRun(getValidBuildArgs({ integrations: [] }), {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/integrations array is required/)
  })

  it('returns error if integration is not a string', async () => {
    const result = await buildAndRun(getValidBuildArgs({
      integrations: [{ id: 'test-integration' }]
    }), {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Each integration must be a string ID/)
  })

  it('returns error if credentials is not an object', async () => {
    const result = await buildAndRun(getValidBuildArgs({
      credentials: 'invalid-credentials'
    }), {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Credentials must be an object/)
  })

  it('accepts array of integration ID strings', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1' }),
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { result: 'success' }, config: { id: 'workflow-1' }, stepResults: [] }),
    }
    const args = getValidBuildArgs({
      integrations: ['integration-1', 'integration-2'],
      client
    })
    const result = await buildAndRun(args, {})
    expect(result.success).toBe(true)
    expect(client.buildWorkflow).toHaveBeenCalledWith({
      instruction: args.instruction,
      integrations: ['integration-1', 'integration-2'],
      payload: args.payload,
      responseSchema: undefined,
      save: false
    })
  })

  it('returns failure if buildWorkflow throws', async () => {
    const client = {
      buildWorkflow: vi.fn().mockRejectedValue(new Error('fail build')),
    }
    const args = getValidBuildArgs({ client })
    const result = await buildAndRun(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/fail build/)
  })

  it('returns workflow_ready_to_save on successful execution', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1' }),
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { result: 'success' }, config: { id: 'workflow-1', steps: [] }, stepResults: [] }),
    }
    const args = getValidBuildArgs({ client })
    const result = await buildAndRun(args, {})
    expect(result.success).toBe(true)
    expect(result.workflow_ready_to_save).toBeDefined()
    expect(result.integrations_used).toBeDefined()
    expect(result.note).toContain('superglue_save_workflow')
  })

  it('calls executeWorkflow with credentials parameter', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1' }),
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { result: 'success' }, config: { id: 'workflow-1' }, stepResults: [] }),
    }
    const args = getValidBuildArgs({
      integrations: ['integration-1'],
      credentials: { apiKey: 'test-key' },
      client
    })
    const result = await buildAndRun(args, {})
    expect(result.success).toBe(true)
    expect(client.executeWorkflow).toHaveBeenCalledWith({
      workflow: { id: 'workflow-1' },
      payload: args.payload,
      credentials: { apiKey: 'test-key' }
    })
  })
})

describe('superglue_execute_workflow', () => {
  it('calls executeWorkflow with minimal valid input (id only)', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { ok: true }, config: { id: 'workflow-minimal' }, stepResults: [] }),
    }
    const args = { id: 'workflow-minimal', client }
    const result = await executeWorkflow(args, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'workflow-minimal' }))
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ ok: true })
  })

  it('calls executeWorkflow with payload', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { foo: 'bar' }, config: {}, stepResults: [] }),
    }
    const args = { id: 'workflow-payload', payload: { foo: 'bar' }, client }
    const result = await executeWorkflow(args, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'workflow-payload', payload: { foo: 'bar' } }))
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ foo: 'bar' })
  })

  it('calls executeWorkflow with all fields', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { ok: true }, config: {}, stepResults: [] }),
    }
    const args = {
      id: 'workflow-all',
      payload: { foo: 1 },
      credentials: { apiKey: 'test' },
      options: { retries: 2 },
      client
    }
    const result = await executeWorkflow(args, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      id: 'workflow-all',
      payload: { foo: 1 },
      credentials: { apiKey: 'test' },
      options: { retries: 2 }
    }))
    expect(result.success).toBe(true)
  })

  it('throws if id is missing', async () => {
    const client = {
      executeWorkflow: vi.fn(),
    }
    const args = { client }
    await expect(executeWorkflow(args, {})).rejects.toThrow(/Workflow ID is required/)
  })
})

describe('superglue_get_workflow_integration_code', () => {
  it('returns code for valid workflowId and language', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1', inputSchema: { properties: {} } })
    }
    const args = { client, workflowId: 'workflow-1', language: 'typescript' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(true)
    expect(result.workflowId).toBe('workflow-1')
    expect(result.language).toBe('typescript')
    expect(result.code).toMatch(/const client = new SuperglueClient/)
  })

  it('fails if workflowId does not exist', async () => {
    const client = {
      getWorkflow: vi.fn().mockRejectedValue(new Error('not found'))
    }
    const args = { client, workflowId: 'bad-id', language: 'typescript' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/bad-id|not found/i)
  })

  it('returns code for all supported languages', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1', inputSchema: { properties: {} } })
    }
    for (const language of ['typescript', 'python', 'go']) {
      const args = { client, workflowId: 'workflow-1', language }
      const result = await getIntegrationCode(args, {})
      expect(result.success).toBe(true)
      expect(result.language).toBe(language)
      expect(result.code).toBeTruthy()
    }
  })

  it('handles invalid language', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1', inputSchema: { properties: {} } })
    }
    const args = { client, workflowId: 'workflow-1', language: 'invalid-language' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid-language/i)
  })
})

describe('superglue_list_available_workflows', () => {
  it('returns workflows with default limit and offset', async () => {
    const mockItems = [
      {
        id: 'workflow-1',
        name: 'Test Workflow 1',
        instruction: 'First test workflow',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'workflow-2',
        instruction: 'Second test workflow',
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z'
      }
    ]
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: mockItems,
        total: 2
      })
    }
    const args = { client }
    const result = await listWorkflows(args, {})

    expect(client.listWorkflows).toHaveBeenCalledWith(10, 0)
    expect(result.success).toBe(true)
    expect(result.workflows).toBeDefined()
    expect(result.total).toBeGreaterThan(0) // Includes static workflows + user workflows
    expect(result.limit).toBe(10)
    expect(result.offset).toBe(0)
    expect(result.usage_tip).toBe("Use workflow IDs with superglue_execute_workflow to run specific workflows")
  })

  it('uses custom limit and offset', async () => {
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: [],
        total: 0
      })
    }
    const args = { client, limit: 5, offset: 20 }
    const result = await listWorkflows(args, {})

    expect(client.listWorkflows).toHaveBeenCalledWith(5, 20)
    expect(result.success).toBe(true)
    expect(result.limit).toBe(5)
    expect(result.offset).toBe(20)
  })

  it('returns failure when listWorkflows throws', async () => {
    const client = {
      listWorkflows: vi.fn().mockRejectedValue(new Error('API error'))
    }
    const args = { client }
    const result = await listWorkflows(args, {})

    expect(result.success).toBe(false)
    expect(result.error).toBe('API error')
    expect(result.suggestion).toBe("Check your API credentials and permissions")
  })
})

describe('superglue_find_relevant_integrations', () => {
  it('returns empty list with helpful message when no integrations exist', async () => {
    const client = {
      findRelevantIntegrations: vi.fn().mockResolvedValue([])
    }
    const args = { client, instruction: 'test instruction' }
    const result = await findIntegrations(args, {})

    expect(result.success).toBe(true)
    expect(result.suggestedIntegrations).toEqual([])
    expect(result.message).toContain('No integrations found')
    expect(result.suggestion).toContain('creating a new integration')
  })

  it('returns all integrations when no instruction provided', async () => {
    const mockIntegrations = [
      { id: 'integration-1', reason: 'Available integration (no specific instruction provided)' }
    ]
    const client = {
      findRelevantIntegrations: vi.fn().mockResolvedValue(mockIntegrations)
    }
    const args = { client }
    const result = await findIntegrations(args, {})

    expect(result.success).toBe(true)
    expect(result.suggestedIntegrations).toEqual(mockIntegrations)
    expect(result.message).toContain('available integration')
  })

  it('returns relevant integrations for instruction', async () => {
    const mockIntegrations = [
      { id: 'crm-integration', reason: 'Matches CRM functionality' }
    ]
    const client = {
      findRelevantIntegrations: vi.fn().mockResolvedValue(mockIntegrations)
    }
    const args = { client, instruction: 'fetch CRM data' }
    const result = await findIntegrations(args, {})

    expect(result.success).toBe(true)
    expect(result.suggestedIntegrations).toEqual(mockIntegrations)
    expect(result.message).toContain('relevant integration')
    expect(result.usage_tip).toContain('superglue_build_and_run')
  })
})

describe('superglue_save_workflow', () => {
  it('saves workflow successfully', async () => {
    const client = {
      upsertWorkflow: vi.fn().mockResolvedValue({ id: 'saved-workflow', name: 'Test Workflow' }),
    }
    const workflow = {
      id: 'test-workflow',
      steps: [],
      instruction: 'Test workflow'
    }
    const args = { client, workflow }
    const result = await saveWorkflow(args, {})

    expect(result.success).toBe(true)
    expect(result.saved_workflow).toBeDefined()
    expect(result.note).toContain('saved successfully')
    expect(client.upsertWorkflow).toHaveBeenCalledWith('test-workflow', workflow)
  })

  it('saves workflow with integration IDs', async () => {
    const client = {
      upsertWorkflow: vi.fn().mockResolvedValue({ id: 'saved-workflow' }),
    }
    const workflow = { id: 'test-workflow', steps: [] }
    const integrations = ['integration-1', 'integration-2']
    const args = { client, workflow, integrations }
    const result = await saveWorkflow(args, {})

    expect(result.success).toBe(true)
    expect(client.upsertWorkflow).toHaveBeenCalledWith('test-workflow', workflow)
  })

  it('returns error if workflow is missing', async () => {
    const client = { upsertWorkflow: vi.fn() }
    const args = { client }
    const result = await saveWorkflow(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Workflow object is required/)
  })

  it('returns error if workflow has no ID', async () => {
    const client = { upsertWorkflow: vi.fn() }
    const workflow = { steps: [] } // Missing ID
    const args = { client, workflow }
    const result = await saveWorkflow(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Workflow must have an ID/)
  })

  it('returns error if integrations is not an array', async () => {
    const client = { upsertWorkflow: vi.fn() }
    const workflow = { id: 'test-workflow', steps: [] }
    const integrations = 'not-an-array'
    const args = { client, workflow, integrations }
    const result = await saveWorkflow(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/integrations must be an array of string IDs/)
  })
})

describe('superglue_create_integration', () => {
  it('creates integration successfully', async () => {
    const client = {
      upsertIntegration: vi.fn().mockResolvedValue({
        id: 'test-integration',
        name: 'Test Integration',
        documentationPending: false
      })
    }
    const args = {
      client,
      id: 'test-integration',
      name: 'Test Integration',
      urlHost: 'https://api.test.com',
      credentials: { apiKey: 'test' }
    }
    const result = await createIntegration(args, {})

    expect(result.success).toBe(true)
    expect(result.integration).toBeDefined()
    expect(result.note).toContain('created successfully')
    expect(client.upsertIntegration).toHaveBeenCalledWith('test-integration', {
      id: 'test-integration',
      name: 'Test Integration',
      urlHost: 'https://api.test.com',
      credentials: { apiKey: 'test' }
    }, 'CREATE')
  })

  it('handles documentation processing', async () => {
    const client = {
      upsertIntegration: vi.fn().mockResolvedValue({
        id: 'test-integration',
        documentationPending: true
      })
    }
    const args = {
      client,
      id: 'test-integration',
      documentationUrl: 'https://api.test.com/docs'
    }
    const result = await createIntegration(args, {})

    expect(result.success).toBe(true)
    expect(result.note).toContain('Documentation is being processed')
  })

  it('returns failure when upsertIntegration throws', async () => {
    const client = {
      upsertIntegration: vi.fn().mockRejectedValue(new Error('Integration creation failed'))
    }
    const args = { client, id: 'test-integration' }
    const result = await createIntegration(args, {})

    expect(result.success).toBe(false)
    expect(result.error).toBe('Integration creation failed')
    expect(result.suggestion).toContain('Validate all integration inputs')
  })
})


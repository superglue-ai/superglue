import { describe, expect, it, vi } from 'vitest'
import { toolDefinitions } from './mcp-server.js'

const buildNewTool = toolDefinitions.superglue_build_new_tool.execute
const executeTool = toolDefinitions.superglue_execute_tool.execute
const getIntegrationCode = toolDefinitions.superglue_get_integration_code.execute
const listTools = toolDefinitions.superglue_list_available_tools.execute

function getValidArgs(overrides = {}) {
  return {
    instruction: 'Fetch all users from CRM and enrich with orders',
    payload: { userId: 123 },
    integrations: [
      { urlHost: 'api.example.com', credentials: { apiKey: 'test' } }
    ],
    client: {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', foo: 'bar' }),
    },
    ...overrides
  }
}

describe('superglue_build_new_tool', () => {
  it('throws if instruction is missing', async () => {
    await expect(buildNewTool(getValidArgs({ instruction: undefined }), {}))
      .rejects.toThrow(/Instruction must be detailed/)
  })

  it('throws if instruction is too short', async () => {
    await expect(buildNewTool(getValidArgs({ instruction: 'short' }), {}))
      .rejects.toThrow(/Instruction must be detailed/)
  })

  it('throws if a integration is providing string credentials', async () => {
    await expect(buildNewTool(getValidArgs({
      integrations: [{ urlHost: 'api.example.com', credentials: "yooo" }]
    }), {})).rejects.toThrow(/Credentials must be an object. E.g. { 'apiKey': '1234567890' }/)
  })

  it('returns failure if buildWorkflow throws', async () => {
    const client = {
      buildWorkflow: vi.fn().mockRejectedValue(new Error('fail build')),
    }
    const args = getValidArgs({ client })
    const result = await buildNewTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/fail build/)
  })

  it('returns success and calls client method on valid input', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', foo: 'bar' }),
    }
    const args = getValidArgs({ client })
    const result = await buildNewTool(args, {})
    expect(result.success).toBe(true)
    expect(client.buildWorkflow).toHaveBeenCalled()
  })
})

describe('superglue_execute_tool', () => {
  it('calls executeWorkflow with minimal valid input (id only)', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { ok: true }, config: { id: 'tool-minimal' }, stepResults: [] }),
      upsertWorkflow: vi.fn().mockResolvedValue(undefined),
    }
    const args = { id: 'tool-minimal', client }
    const result = await executeTool(args, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tool-minimal' }))
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ ok: true })
  })

  it('calls executeWorkflow with payload', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { foo: 'bar' }, config: {}, stepResults: [] }),
      upsertWorkflow: vi.fn().mockResolvedValue(undefined),
    }
    const args = { id: 'tool-payload', payload: { foo: 'bar' }, client }
    const result = await executeTool(args, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tool-payload', payload: { foo: 'bar' }, client }))
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ foo: 'bar' })
  })

  it('calls executeWorkflow with all fields', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { ok: true }, config: {}, stepResults: [] }),
      upsertWorkflow: vi.fn().mockResolvedValue(undefined),
    }
    const args = {
      id: 'tool-all',
      payload: { foo: 1 },
      credentials: { apiKey: 'test' },
      options: { retries: 2 },
      client
    }
    const result = await executeTool(args, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tool-all',
      payload: { foo: 1 },
      credentials: { apiKey: 'test' },
      options: { retries: 2 }
    }))
    expect(result.success).toBe(true)
  })

  it('calls executeWorkflow with null/undefined/empty payload', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: {}, config: {}, stepResults: [] }),
      upsertWorkflow: vi.fn().mockResolvedValue(undefined),
    }
    // null payload
    const argsNull = { id: 'tool-null', payload: null, client }
    let result = await executeTool(argsNull, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tool-null', payload: null }))
    expect(result.success).toBe(true)
    // undefined payload
    const argsUndefined = { id: 'tool-undefined', client }
    result = await executeTool(argsUndefined, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tool-undefined' }))
    expect(result.success).toBe(true)
    // empty object payload
    const argsEmpty = { id: 'tool-empty', payload: {}, client }
    result = await executeTool(argsEmpty, {})
    expect(client.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'tool-empty', payload: {} }))
    expect(result.success).toBe(true)
  })

  it('throws if id is missing', async () => {
    const client = {
      executeWorkflow: vi.fn(),
    }
    const args = { client }
    await expect(executeTool(args, {})).rejects.toThrow(/Tool ID is required/)
  })
})

describe('superglue_get_integration_code', () => {
  it('returns code for valid toolId and language', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', inputSchema: { properties: {} } })
    }
    const args = { client, toolId: 'tool-1', language: 'typescript' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(true)
    expect(result.toolId).toBe('tool-1')
    expect(result.language).toBe('typescript')
    expect(result.code).toMatch(/const client = new SuperglueClient/)
  })

  it('fails if toolId does not exist', async () => {
    const client = {
      getWorkflow: vi.fn().mockRejectedValue(new Error('not found'))
    }
    const args = { client, toolId: 'bad-id', language: 'typescript' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/bad-id|not found/i)
  })

  it('returns code for all supported languages', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', inputSchema: { properties: {} } })
    }
    for (const language of ['typescript', 'python', 'go']) {
      const args = { client, toolId: 'tool-1', language }
      const result = await getIntegrationCode(args, {})
      expect(result.success).toBe(true)
      expect(result.language).toBe(language)
      expect(result.code).toBeTruthy()
    }
  })

  it('handles workflow with missing/empty inputSchema', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'tool-3' })
    }
    const args = { client, toolId: 'tool-3', language: 'typescript' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(true)
    expect(result.code).toMatch(/payload/)
  })

  it('handles workflow with complex inputSchema', async () => {
    const complexSchema = {
      properties: {
        payload: {
          properties: {
            foo: { type: 'string' },
            bar: { type: 'number' },
            baz: { type: 'array', items: { type: 'string' } },
            nested: { type: 'object', properties: { a: { type: 'boolean' } } }
          }
        },
        credentials: { properties: {} }
      }
    }
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'tool-4', inputSchema: complexSchema })
    }
    const args = { client, toolId: 'tool-4', language: 'typescript' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(true)
    console.log(result.code)
    expect(result.code).toMatch(/foo/)
    expect(result.code).toMatch(/bar/)
    expect(result.code).toMatch(/baz/)
    expect(result.code).toMatch(/nested/)
  })

  it('handles invalid language', async () => {
    const client = {
      getWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', inputSchema: { properties: {} } })
    }
    const args = { client, toolId: 'tool-1', language: 'invalid-language' }
    const result = await getIntegrationCode(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid-language/i)
  })
})
// ... existing code ...

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
    ]
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: mockItems,
        total: 2
      })
    }
    const args = { client }
    const result = await listTools(args, {})

    expect(client.listWorkflows).toHaveBeenCalledWith(10, 0)
    expect(result.success).toBe(true)
    expect(result.tools).toHaveLength(2)
    expect(result.tools[0]).toEqual({
      id: 'tool-1',
      name: 'Test Tool 1',
      instruction: 'First test tool',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    })
    expect(result.tools[1]).toEqual({
      id: 'tool-2',
      name: 'tool-2', // falls back to id when name is missing
      instruction: 'Second test tool',
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z'
    })
    expect(result.total).toBe(2)
    expect(result.limit).toBe(10)
    expect(result.offset).toBe(0)
    expect(result.usage_tip).toBe("Use tool IDs with superglue_execute_tool to run specific tools")
  })

  it('uses custom limit and offset', async () => {
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: [],
        total: 0
      })
    }
    const args = { client, limit: 5, offset: 20 }
    const result = await listTools(args, {})

    expect(client.listWorkflows).toHaveBeenCalledWith(5, 20)
    expect(result.success).toBe(true)
    expect(result.limit).toBe(5)
    expect(result.offset).toBe(20)
  })

  it('handles empty results', async () => {
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: [],
        total: 0
      })
    }
    const args = { client }
    const result = await listTools(args, {})

    expect(result.success).toBe(true)
    expect(result.tools).toEqual([])
    expect(result.total).toBe(0)
  })

  it('returns failure when listWorkflows throws', async () => {
    const client = {
      listWorkflows: vi.fn().mockRejectedValue(new Error('API error'))
    }
    const args = { client }
    const result = await listTools(args, {})

    expect(result.success).toBe(false)
    expect(result.error).toBe('API error')
    expect(result.suggestion).toBe("Check your API credentials and permissions")
  })

  it('handles tools with missing name field', async () => {
    const mockItems = [
      {
        id: 'tool-no-name',
        instruction: 'Tool without name',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }
    ]
    const client = {
      listWorkflows: vi.fn().mockResolvedValue({
        items: mockItems,
        total: 1
      })
    }
    const args = { client }
    const result = await listTools(args, {})

    expect(result.success).toBe(true)
    expect(result.tools[0].name).toBe('tool-no-name') // uses id as fallback
  })
})


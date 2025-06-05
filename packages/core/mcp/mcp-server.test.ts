import { toolDefinitions } from './mcp-server.js'
import { describe, it, expect, vi } from 'vitest'

const buildNewTool = toolDefinitions.superglue_build_new_tool.execute

function getValidArgs(overrides = {}) {
  return {
    instruction: 'Fetch all users from CRM and enrich with orders',
    payload: { userId: 123 },
    systems: [
      { urlHost: 'api.example.com', credentials: { apiKey: 'test' } }
    ],
    client: {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', foo: 'bar' }),
      upsertWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', foo: 'bar' }),
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

  it('throws if systems is missing', async () => {
    await expect(buildNewTool(getValidArgs({ systems: undefined }), {}))
      .rejects.toThrow(/Systems array is required/)
  })

  it('throws if systems is empty', async () => {
    await expect(buildNewTool(getValidArgs({ systems: [] }), {}))
      .rejects.toThrow(/Systems array is required/)
  })

  it('throws if a system is missing urlHost', async () => {
    await expect(buildNewTool(getValidArgs({
      systems: [{ credentials: { apiKey: 'test' } }]
    }), {})).rejects.toThrow(/urlHost is required/)
  })

  it('throws if a system is missing credentials', async () => {
    await expect(buildNewTool(getValidArgs({
      systems: [{ urlHost: 'api.example.com', credentials: {} }]
    }), {})).rejects.toThrow(/credentials object is required/)
  })

  it('returns success and calls client methods on valid input', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', foo: 'bar' }),
      upsertWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', foo: 'bar' }),
    }
    const args = getValidArgs({ client })
    const result = await buildNewTool(args, {})
    expect(result.success).toBe(true)
    expect(client.buildWorkflow).toHaveBeenCalled()
    expect(client.upsertWorkflow).toHaveBeenCalled()
  })

  it('returns failure if buildWorkflow throws', async () => {
    const client = {
      buildWorkflow: vi.fn().mockRejectedValue(new Error('fail build')),
      upsertWorkflow: vi.fn(),
    }
    const args = getValidArgs({ client })
    const result = await buildNewTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/fail build/)
  })

  it('returns failure if upsertWorkflow throws', async () => {
    const client = {
      buildWorkflow: vi.fn().mockResolvedValue({ id: 'tool-1', foo: 'bar' }),
      upsertWorkflow: vi.fn().mockRejectedValue(new Error('fail upsert')),
    }
    const args = getValidArgs({ client })
    const result = await buildNewTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/fail upsert/)
  })
})

// ... existing code ...

describe('superglue_execute_tool', () => {
  const executeTool = toolDefinitions.superglue_execute_tool.execute

  it('throws if workflow/tool does not exist', async () => {
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Workflow not found')),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'nonexistent', client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('throws if workflow built with non-empty payload but executed with missing payload', async () => {
    // Simulate workflow expects payload { foo: string }
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Missing required payload: foo')),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-with-payload', client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/missing.*payload/i)
  })

  it('throws if workflow built with a specific input schema but executed with a different payload shape', async () => {
    // Simulate workflow expects { foo: string }, got { bar: 123 }
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Payload does not match input schema')),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-with-schema', payload: { bar: 123 }, client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/input schema/i)
  })

  it('throws if workflow built without a payload but executed with a payload', async () => {
    // Simulate workflow expects no payload, but got one
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Payload not allowed for this workflow')),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-no-payload', payload: { foo: 'bar' }, client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not allowed/i)
  })

  it('handles null payload (should throw if not allowed)', async () => {
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Payload cannot be null')),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-null-payload', payload: null, client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/null/i)
  })

  it('handles empty string payload (should throw if not allowed)', async () => {
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Payload must be an object')),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-empty-string', payload: '', client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/object/i)
  })

  it('handles payload with extra fields (should throw if strict schema)', async () => {
    const client = {
      executeWorkflow: vi.fn().mockRejectedValue(new Error('Unexpected field: extra')),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-strict', payload: { foo: 'bar', extra: 1 }, client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/unexpected field/i)
  })

  it('returns success if everything matches', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { ok: true }, config: {}, stepResults: [] }),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-ok', payload: { foo: 'bar' }, client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ ok: true })
    expect(client.executeWorkflow).toHaveBeenCalled()
  })

  it('calls upsertWorkflow when executeWorkflow is successful', async () => {
    const client = {
      executeWorkflow: vi.fn().mockResolvedValue({ success: true, data: { ok: true }, config: { id: 'tool-ok' }, stepResults: [] }),
      upsertWorkflow: vi.fn()
    }
    const args = { id: 'tool-ok', payload: { foo: 'bar' }, client }
    const result = await executeTool(args, {})
    expect(result.success).toBe(true)
    expect(client.upsertWorkflow).toHaveBeenCalledWith('tool-ok', { id: 'tool-ok' })
  })


})


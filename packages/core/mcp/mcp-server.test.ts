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

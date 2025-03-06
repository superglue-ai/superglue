import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSchema } from './schema.js'
import LLMClient from './llm.js'

// First mock the modules
vi.mock('./llm.js')
vi.mock('./model-provider.js', () => ({
  default: {
    getSchemaModel: vi.fn(() => 'gpt-4o')
  }
}))

// Then create the mock implementation
const mockGetText = vi.fn()
const mockGetObject = vi.fn()

// Set up the mock implementation
vi.mocked(LLMClient).getInstance = vi.fn(() => ({
  getText: mockGetText,
  getObject: mockGetObject
}))

describe('generateSchema', () => {
  const originalEnv = { ...process.env }
  
  // Test data
  const instruction = "get me all characters with only their name"
  const responseData = '{"results": [{"name": "Homer", "species": "Human"}, {"name": "Bart", "species": "Human"}]}'
  const expectedSchema = {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object", 
          properties: {
            name: {
              type: "string"
            }
          },
          required: ["name"]
        }
      }
    },
    required: ["results"]
  }

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }    
    // Reset the mocks before each test
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should generate a valid schema (happy path)', async () => {
    mockGetText.mockResolvedValueOnce(JSON.stringify({ jsonSchema: expectedSchema }))

    const schema = await generateSchema(instruction, responseData)
    expect(schema).toEqual(expectedSchema)
    expect(mockGetText).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and succeed on second attempt', async () => {
    // Mock a failure on first attempt, success on second
    const errorMessage = 'Test error message'
    mockGetText.mockRejectedValueOnce(new Error(errorMessage))
    mockGetText.mockResolvedValueOnce(JSON.stringify({ jsonSchema: expectedSchema }))

    const schema = await generateSchema(instruction, responseData)
    expect(schema).toEqual(expectedSchema)

    expect(mockGetText).toHaveBeenCalledTimes(2)

    const secondCallArgs = mockGetText.mock.calls[1][0]
    const lastMessage = secondCallArgs.messages[secondCallArgs.messages.length - 1]
    expect(lastMessage.content).toContain(errorMessage)
  })

  it.skip('should not include temperature parameter for o3-mini model', async () => {
    process.env.SCHEMA_GENERATION_MODEL = 'o3-mini'
    mockGetText.mockResolvedValueOnce(JSON.stringify({ jsonSchema: expectedSchema }))

    await generateSchema(instruction, responseData)

    const o3MiniCallArgs = mockGetText.mock.calls[0][0]
    expect(o3MiniCallArgs.temperature).toBeUndefined()
    expect(o3MiniCallArgs.model).toBe('o3-mini')
    
    // Reset for gpt-4o test
    vi.clearAllMocks()
    delete process.env.SCHEMA_GENERATION_MODEL // Remove specific model setting
    
    mockGetText.mockResolvedValueOnce(JSON.stringify({ jsonSchema: expectedSchema }))
    
    await generateSchema(instruction, responseData)
    
    const gpt4oCallArgs = mockGetText.mock.calls[0][0]
    // Verify temperature parameter is included for gpt-4o
    expect(gpt4oCallArgs.temperature).toBeDefined()
    expect(gpt4oCallArgs.model).toBe('gpt-4o')
  })

  // Skip live API tests when API key isn't available
  if(!process.env.VITE_OPENAI_API_KEY) {
    it('skips live tests when VITE_OPENAI_API_KEY is not set', () => {})
  }
})

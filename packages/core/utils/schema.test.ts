import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSchema } from './schema.js'

// Create mock functions that will be used in our tests
const mockCreate = vi.fn()

// Mock the openai module
vi.mock('openai', () => {
  return {
    default: function() {
      return {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      }
    }
  }
})

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
    process.env.OPENAI_API_KEY = 'test-key'
    // Set default model for tests
    process.env.OPENAI_MODEL = 'gpt-4o'
    
    // Reset the mocks before each test
    vi.resetAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should generate a valid schema (happy path)', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ jsonSchema: expectedSchema })
          }
        }
      ]
    })

    const schema = await generateSchema(instruction, responseData, {})
    expect(schema).toEqual(expectedSchema)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and succeed on second attempt', async () => {
    // Mock a failure on first attempt, success on second
    const errorMessage = 'Test error message'
    mockCreate.mockRejectedValueOnce(new Error(errorMessage))
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ jsonSchema: expectedSchema })
          }
        }
      ]
    })

    const schema = await generateSchema(instruction, responseData, {})
    expect(schema).toEqual(expectedSchema)

    expect(mockCreate).toHaveBeenCalledTimes(2)

    const secondCallArgs = mockCreate.mock.calls[1][0]
    const lastMessage = secondCallArgs.messages[secondCallArgs.messages.length - 1]
    expect(lastMessage.content).toContain(errorMessage)
  })

  it('should not include temperature parameter for o3-mini model', async () => {
    process.env.SCHEMA_GENERATION_MODEL = 'o3-mini'
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ jsonSchema: expectedSchema })
          }
        }
      ]
    })

    await generateSchema(instruction, responseData, {})

    const o3MiniCallArgs = mockCreate.mock.calls[0][0]
    expect(o3MiniCallArgs.temperature).toBeUndefined()
    expect(o3MiniCallArgs.model).toBe('o3-mini')
    
    // Reset for gpt-4o test
    vi.resetAllMocks()
    delete process.env.SCHEMA_GENERATION_MODEL // Remove specific model setting
    process.env.OPENAI_MODEL = 'gpt-4o' // Set via fallback
    
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ jsonSchema: expectedSchema })
          }
        }
      ]
    })
    
    await generateSchema(instruction, responseData, {})
    
    const gpt4oCallArgs = mockCreate.mock.calls[0][0]
    // Verify temperature parameter is included for gpt-4o
    expect(gpt4oCallArgs.temperature).toBeDefined()
    expect(gpt4oCallArgs.model).toBe('gpt-4o')
  })

  // Skip live API tests when API key isn't available
  if(!process.env.VITE_OPENAI_API_KEY) {
    it('skips live tests when VITE_OPENAI_API_KEY is not set', () => {})
  }
})

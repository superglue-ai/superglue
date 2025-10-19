import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModel } from '../llm/language-model.js';
import { generateSchema } from './schema.js';

// Update the mock to be more flexible
vi.mock('../llm/language-model.js', () => {
  return {
    LanguageModel: {
      generateObject: vi.fn().mockImplementation(async (messages, _, temperature) => ({
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
      }))
    }
  };
});

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
    process.env.OPENAI_MODEL = 'gpt-4.1'

    // Reset the mocks before each test
    vi.resetAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should generate a valid schema (happy path)', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)
    generateObject.mockResolvedValueOnce({ response: expectedSchema, messages: [] })

    const schema = await generateSchema(instruction, responseData, {})
    expect(schema).toEqual(expectedSchema)
    expect(LanguageModel.generateObject).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and succeed on second attempt', async () => {
    const errorMessage = 'Test error message'
    const generateObject = vi.mocked(LanguageModel.generateObject)

    // First call fails
    generateObject.mockRejectedValueOnce(new Error(errorMessage))
    // Second call succeeds
    generateObject.mockResolvedValueOnce({ response: expectedSchema, messages: [] })

    const schema = await generateSchema(instruction, responseData, {})
    expect(schema).toEqual(expectedSchema)
    expect(generateObject).toHaveBeenCalledTimes(2)

    const secondCallArgs = generateObject.mock.calls[1][0]
    const lastMessage = secondCallArgs[secondCallArgs.length - 1]
    expect(lastMessage.content).toContain(errorMessage)
  })

  it('should not include temperature parameter for o3-mini model', async () => {
    process.env.SCHEMA_GENERATION_MODEL = 'o3-mini'
    const generateObject = vi.mocked(LanguageModel.generateObject)
    generateObject.mockResolvedValueOnce({ response: expectedSchema, messages: [] })

    await generateSchema(instruction, responseData, {})

    expect(generateObject).toHaveBeenCalledWith(
      expect.any(Array),
      null,
      0
    )

    vi.resetAllMocks()
    delete process.env.SCHEMA_GENERATION_MODEL
    process.env.OPENAI_MODEL = 'gpt-4.1'

    generateObject.mockResolvedValueOnce({ response: expectedSchema, messages: [] })

    await generateSchema(instruction, responseData, {})

    expect(generateObject).toHaveBeenCalledWith(
      expect.any(Array),
      null,
      expect.any(Number)
    )
  })

  // Skip live API tests when API key isn't available
  if (!process.env.VITE_OPENAI_API_KEY) {
    it('skips live tests when VITE_OPENAI_API_KEY is not set', () => { })
  }
})

import { describe, expect, it, vi } from 'vitest'
import { generateSchema } from './schema.js'

describe('generateSchema', () => {
  vi.setConfig({ testTimeout: 20000 }) // 20 seconds timeout

  if(!process.env.VITE_OPENAI_API_KEY) {
    it('skips tests when VITE_OPENAI_API_KEY is not set', () => {})
    return
  }
  else {
    process.env.OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;
    process.env.OPENAI_MODEL = process.env.VITE_OPENAI_MODEL || 'gpt-4o-2024-11-20';
  }
  it('should generate a valid schema', async () => {
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
    const schema = await generateSchema("get me all characters with only their name", '{"results": [{"name": "Rick", "species": "Human"}, {"name": "Morty", "species": "Human"}]}')
    expect(schema).toEqual(expectedSchema)
  })

  it('should generate a valid schema for a single object response', async () => {
    const expectedSchema = {
      type: "object",
      properties: {
        result: {
          type: "object",
          properties: {
            id: {
              type: "string"
            },
            status: {
              type: "string",

            }
          },
          required: ["id", "status"]
        }
      },
      required: ["result"]
    }
    const schema = await generateSchema(
      "Get the current account status and ID for the authenticated user",
      '{"result": {"id": "123e4567-e89b-12d3-a456-426614174000", "status": "active"}}'
    )
    expect(schema).toEqual(expectedSchema)
  })
})
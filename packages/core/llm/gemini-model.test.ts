import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiModel } from './gemini-model.js';

vi.mock('@google/generative-ai');

describe('GeminiModel', () => {
  const mockSendMessage = vi.fn();
  const mockStartChat = vi.fn(() => ({ sendMessage: mockSendMessage }));
  const mockGetGenerativeModel = vi.fn(() => ({ startChat: mockStartChat }));

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    (GoogleGenerativeAI as any).mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel
    }));
    mockSendMessage.mockResolvedValue({ response: { text: () => 'test response' } });
  });

  describe('generateText', () => {
    it('should generate text response', async () => {
      const model = new GeminiModel();
      const messages = [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user message' }
      ] as ChatCompletionMessageParam[];

      const result = await model.generateText(messages);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-preview-04-17',
        systemInstruction: 'system prompt'
      });
      expect(result.response).toBe('test response');
      expect(result.messages).toHaveLength(3);
    });
  });

  describe('generateObject', () => {
    it('should generate object response', async () => {
      const model = new GeminiModel();
      mockSendMessage.mockResolvedValue({
        response: { text: () => '{"key": "value"}' }
      });

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const result = await model.generateObject([
        { role: 'user', content: 'test' }
      ], schema);

      expect(result.response).toEqual({ key: 'value' });
    });

    it('should clean schema for Gemini', async () => {
      const model = new GeminiModel();
      mockSendMessage.mockResolvedValue({
        response: { text: () => '{}' }
      });

      const inputSchema = {
        $schema: 'test',
        additionalProperties: true,
        optional: true,
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            additionalProperties: true,
            optional: true,
            properties: {
              deep: {
                type: 'object',
                additionalProperties: false
              }
            }
          }
        }
      };

      const expectedCleanedSchema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              deep: {
                type: 'object'
              },
            },
            required: ['deep'],
          },
        },
        required: ['nested'],
      };

      await model.generateObject([
        { role: 'user', content: 'test' }
      ], inputSchema);

      // Verify the cleaned schema was passed to the API
      expect(mockStartChat).toHaveBeenCalledWith(expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseSchema: expectedCleanedSchema
        })
      }));
    });

    it('should handle JSON cleaning in responses', async () => {
      const model = new GeminiModel();
      const testCases = [
        {
          input: '```json\n{"key": "value"}\n```',
          expected: { key: 'value' },
          schema: { type: 'object' }
        },
        {
          input: 'Here is your JSON: {"key": "value"}',
          expected: { key: 'value' },
          schema: { type: 'object' }
        },
        {
          input: '[{"key": "value"}]',
          expected: [{ key: 'value' }],
          schema: { type: 'array' }
        },
        {
          input: '{"key": "value"}',
          expected: { key: 'value' },
          schema: { type: 'object' }
        }
      ];

      for (const { input, expected, schema } of testCases) {
        mockSendMessage.mockResolvedValueOnce({
          response: { text: () => input }
        });

        const result = await model.generateObject([
          { role: 'user', content: 'test' }
        ], schema);

        expect(result.response).toEqual(expected);
      }
    });

    it('should clean schema with arrays', async () => {
      const model = new GeminiModel();
      mockSendMessage.mockResolvedValue({
        response: { text: () => '[{"test": "value"}]' }
      });

      const inputSchema = {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          optional: true,
          properties: {
            field: {
              type: 'string',
              additionalProperties: false
            },
            nested: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  subField: { type: 'string' }
                }
              }
            }
          }
        }
      };

      const expectedCleanedSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: {
              type: 'string',
            },
            nested: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  subField: { type: 'string' },
                },
                required: ['subField'],
              },
            },
          },
          required: ['field', 'nested'],
        },
      };

      await model.generateObject([
        { role: 'user', content: 'test' }
      ], inputSchema);

      expect(mockStartChat).toHaveBeenCalledWith(expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseSchema: expectedCleanedSchema
        })
      }));
    });
  });
}); 
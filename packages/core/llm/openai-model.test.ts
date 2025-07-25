import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIModel } from './openai-model.js';

vi.mock('openai');

describe('OpenAIModel', () => {
  const mockCreate = vi.fn();
  const MOCK_DATE = '2024-01-01T00:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MOCK_DATE));
    process.env.OPENAI_API_KEY = 'test-key';
    (OpenAI as any).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    }));
  });

  describe('generateText', () => {
    it('should generate text response', async () => {
      const model = new OpenAIModel();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'test response' } }]
      });

      const messages = [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user message' }
      ] as ChatCompletionMessageParam[];

      const result = await model.generateText(messages);

      expect(mockCreate).toHaveBeenCalledWith({
        messages: [
          { role: 'system', content: 'The current date and time is ' + MOCK_DATE },
          ...messages
        ],
        model: 'gpt-4.1',
        temperature: 0
      });
      expect(result.response).toBe('test response');
      expect(result.messages).toHaveLength(3);
    });

    it('should handle temperature undefined for o-models', async () => {
      const oldOpenAiModel = process.env.OPENAI_MODEL;
      process.env.OPENAI_MODEL = 'o-model';
      const model = new OpenAIModel();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'test response' } }]
      });

      await model.generateText([{ role: 'user', content: 'test' }]);

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        temperature: undefined
      }));
    });
  });

  describe('generateObject', () => {
    it('should generate object response', async () => {
      process.env.OPENAI_MODEL = 'gpt-4.1';
      const model = new OpenAIModel();
      const responseJson = '{"key": "value"}';
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: responseJson } }]
      });

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const messages = [
        { role: 'user', content: 'test' }
      ] as ChatCompletionMessageParam[];

      const oldMessages = [...messages];
      const result = await model.generateObject(messages, schema);

      expect(mockCreate).toHaveBeenCalledWith({
        messages: [
          { role: 'system', content: 'The current date and time is ' + MOCK_DATE },
          ...messages
        ],
        model: 'gpt-4.1',
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                key: { type: ['string', 'null'] }
              },
              required: ['key'],
              strict: true,
              additionalProperties: false
            }
          }
        }
      });
      expect(result.response).toEqual({ key: 'value' });
      expect(result.messages).toEqual([
        ...oldMessages,
        { role: 'assistant', content: responseJson }
      ]);
    });

    it('should handle schema without additionalProperties', async () => {
      const model = new OpenAIModel();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '{"nested": {"field": "value"}}' } }]
      });

      const schema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              field: { type: 'string' }
            }
          }
        }
      };

      const result = await model.generateObject([
        { role: 'user', content: 'test' }
      ], schema);

      expect(result.response).toEqual({ nested: { field: 'value' } });
    });
  });
}); 
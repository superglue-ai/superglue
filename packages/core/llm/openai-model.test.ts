import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIModel } from './openai-model.js';

vi.mock('openai');

describe('OpenAIModel', () => {
  const mockResponsesCreate = vi.fn();
  const mockChatCreate = vi.fn();
  const MOCK_DATE = '2024-01-01T00:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MOCK_DATE));
    process.env.OPENAI_API_KEY = 'test-key';
    (OpenAI as any).mockImplementation(() => ({
      responses: {
        create: mockResponsesCreate
      },
      chat: {
        completions: {
          create: mockChatCreate
        }
      }
    }));
  });

  describe('generateText', () => {
    it('should generate text response', async () => {
      const model = new OpenAIModel();
      mockResponsesCreate.mockResolvedValue({
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'output_text',
            text: 'test response'
          }]
        }]
      });

      const messages = [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user message' }
      ] as ChatCompletionMessageParam[];

      const result = await model.generateText(messages);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'gpt-4.1',
        input: [
          { role: 'system', content: 'The current date and time is ' + MOCK_DATE },
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user message' }
        ],
        temperature: 0,
        store: false
      });
      expect(result.response).toBe('test response');
      expect(result.messages).toHaveLength(3);
    });

    it('should handle temperature undefined for o-models', async () => {
      const oldOpenAiModel = process.env.OPENAI_MODEL;
      process.env.OPENAI_MODEL = 'o-model';
      const model = new OpenAIModel();
      mockResponsesCreate.mockResolvedValue({
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'output_text',
            text: 'test response'
          }]
        }]
      });

      await model.generateText([{ role: 'user', content: 'test' }]);

      expect(mockResponsesCreate).toHaveBeenCalledWith(expect.objectContaining({
        temperature: undefined
      }));
      process.env.OPENAI_MODEL = undefined;
    });

    it('should fallback to chat completions on error', async () => {
      const model = new OpenAIModel();
      mockResponsesCreate.mockRejectedValue(new Error('Responses API error'));
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'fallback response' } }]
      });

      const result = await model.generateText([{ role: 'user', content: 'test' }]);

      expect(mockChatCreate).toHaveBeenCalled();
      expect(result.response).toBe('fallback response');
    });
  });

  describe('generateObject', () => {
    it('should generate object response', async () => {
      process.env.OPENAI_MODEL = 'gpt-4.1';
      const model = new OpenAIModel();
      const responseJson = '{"key": "value"}';
      // Mock the response with a tool call to "submit"
      mockResponsesCreate.mockResolvedValue({
        output: [{
          type: 'function_call',
          name: 'submit',
          call_id: 'call_123',
          arguments: responseJson
        }]
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

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'gpt-4.1',
        input: expect.arrayContaining([
          { role: 'system', content: 'The current date and time is ' + MOCK_DATE },
          { role: 'user', content: 'test' }
        ]),
        tools: expect.arrayContaining([
          expect.objectContaining({
            type: 'function',
            name: 'submit',
            parameters: expect.objectContaining({
              type: 'object',
              properties: {
                key: { type: ['string', 'null'] }
              }
            })
          }),
          { type: 'web_search' }
        ]),
        temperature: 0,
        tool_choice: 'required'
      });
      expect(result.response).toEqual({ key: 'value' });
      // The messages now include all intermediate steps from the Responses API
      expect(result.messages).toContainEqual(
        expect.objectContaining({ role: 'assistant', content: JSON.stringify({ key: 'value' }) })
      );
    });

    it('should handle schema without additionalProperties', async () => {
      const model = new OpenAIModel();
      // Mock response with tool call inside a message
      mockResponsesCreate.mockResolvedValue({
        output: [{
          type: 'message',
          tool_calls: [{
            id: 'call_456',
            function: {
              name: 'submit',
              arguments: '{"nested": {"field": "value"}}'
            }
          }]
        }]
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
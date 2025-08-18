import Anthropic from '@anthropic-ai/sdk';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicModel } from './anthropic-model.js';

vi.mock('@anthropic-ai/sdk');

describe('AnthropicModel', () => {
  const mockCreate = vi.fn();
  const MOCK_DATE = '2024-01-01T00:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MOCK_DATE));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.ANTHROPIC_MODEL; // Properly delete to use default
    (Anthropic as any).mockImplementation(() => ({
      messages: {
        create: mockCreate
      }
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateText', () => {
    it('should generate text response with proper message conversion', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'Claude response' }
        ]
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
      ];

      const result = await model.generateText(messages);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        system: 'You are a helpful assistant\n\nThe current date and time is ' + MOCK_DATE,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
          { role: 'user', content: 'How are you?' }
        ],
        temperature: 0,
        max_tokens: 8192
      });

      expect(result.response).toBe('Claude response');
      expect(result.messages).toHaveLength(5); // Original 4 + 1 assistant response
      expect(result.messages[4]).toEqual({
        role: 'assistant',
        content: 'Claude response'
      });
    });

    it('should handle multiple system messages', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'First system message' },
        { role: 'system', content: 'Second system message' },
        { role: 'user', content: 'Question' }
      ];

      await model.generateText(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'First system message\n\nSecond system message\n\nThe current date and time is ' + MOCK_DATE
        })
      );
    });

    it('should handle custom temperature', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      await model.generateText([
        { role: 'user', content: 'Test' }
      ], 0.7);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7
        })
      );
    });

    it('should use custom model from environment variable', async () => {
      process.env.ANTHROPIC_MODEL = 'claude-3-opus-20240229';
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      await model.generateText([
        { role: 'user', content: 'Test' }
      ]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229'
        })
      );
    });

    it('should handle multiple content blocks', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
          { type: 'other', data: 'ignored' }, // Non-text content should be filtered
          { type: 'text', text: 'Part 3' }
        ]
      });

      const result = await model.generateText([
        { role: 'user', content: 'Test' }
      ]);

      expect(result.response).toBe('Part 1\nPart 2\nPart 3');
    });
  });

  describe('generateObject', () => {
    it('should generate object response with schema instruction', async () => {
      const model = new AnthropicModel();
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name', 'age']
      };

      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'Here is the JSON:\n<json>\n{"name": "John", "age": 30}\n</json>' }
        ]
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Generate a person object' }
      ];

      const result = await model.generateObject(messages, schema);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        system: 'The current date and time is ' + MOCK_DATE,
        messages: [
          { 
            role: 'user', 
            content: 'Generate a person object\n\nPlease respond with a JSON object that matches this schema, wrapped in <json> tags:\n<json>\n' + JSON.stringify(schema, null, 2) + '\n</json>\n\nYour response must contain ONLY the JSON object within the <json> tags, with no additional text or explanation.'
          }
        ],
        temperature: 0,
        max_tokens: 8192
      });

      expect(result.response).toEqual({ name: 'John', age: 30 });
      expect(result.messages).toHaveLength(2);
    });

    it('should extract JSON from various response formats', async () => {
      const model = new AnthropicModel();
      const schema = { type: 'object', properties: { test: { type: 'string' } } };

      // Test XML format
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Sure! <json>{"test": "xml"}</json>' }]
      });
      let result = await model.generateObject([{ role: 'user', content: 'Test' }], schema);
      expect(result.response).toEqual({ test: 'xml' });

      // Test code block format
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Here is the response:\n```json\n{"test": "codeblock"}\n```' }]
      });
      result = await model.generateObject([{ role: 'user', content: 'Test' }], schema);
      expect(result.response).toEqual({ test: 'codeblock' });

      // Test plain JSON format (fallback)
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The answer is {"test": "plain"} as requested.' }]
      });
      result = await model.generateObject([{ role: 'user', content: 'Test' }], schema);
      expect(result.response).toEqual({ test: 'plain' });
    });

    it('should handle schema instruction with existing system message', async () => {
      const model = new AnthropicModel();
      const schema = { type: 'object', properties: { test: { type: 'string' } } };

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '<json>{"test": "value"}</json>' }]
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a JSON generator' },
        { role: 'user', content: 'First request' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Generate JSON' }
      ];

      await model.generateObject(messages, schema);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        system: 'You are a JSON generator\n\nThe current date and time is ' + MOCK_DATE,
        messages: [
          { role: 'user', content: 'First request' },
          { role: 'assistant', content: [{ type: 'text', text: 'First response' }] },
          { 
            role: 'user', 
            content: 'Generate JSON\n\nPlease respond with a JSON object that matches this schema, wrapped in <json> tags:\n<json>\n' + JSON.stringify(schema, null, 2) + '\n</json>\n\nYour response must contain ONLY the JSON object within the <json> tags, with no additional text or explanation.'
          }
        ],
        temperature: 0,
        max_tokens: 8192
      });
    });

    it('should throw error when no valid JSON found', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'This response contains no JSON' }]
      });

      await expect(
        model.generateObject([
          { role: 'user', content: 'Test' }
        ], { type: 'object' })
      ).rejects.toThrow('JSON extraction failed');
    });

    it('should validate required fields in schema', async () => {
      const model = new AnthropicModel();
      const schema = {
        type: 'object',
        properties: {
          required_field: { type: 'string' },
          optional_field: { type: 'number' }
        },
        required: ['required_field']
      };

      // Missing required field
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '<json>{"optional_field": 42}</json>' }]
      });

      await expect(
        model.generateObject([
          { role: 'user', content: 'Test' }
        ], schema)
      ).rejects.toThrow('Missing required field: required_field');
    });

    it('should handle malformed JSON', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Here is broken JSON: {"key": invalid}' }]
      });

      await expect(
        model.generateObject([
          { role: 'user', content: 'Test' }
        ], { type: 'object' })
      ).rejects.toThrow(); // JSON.parse will throw
    });
  });

  describe('convertToAnthropicFormat', () => {
    it('should handle empty messages', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      const result = await model.generateText([]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'The current date and time is ' + MOCK_DATE,
          messages: []
        })
      );
    });

    it('should filter out non-supported message roles', async () => {
      const model = new AnthropicModel();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      const messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
        { role: 'function', content: 'Function call' }, // Should be ignored
        { role: 'assistant', content: 'Assistant' },
        { role: 'tool', content: 'Tool call' } // Should be ignored
      ] as any;

      await model.generateText(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'User' },
            { role: 'assistant', content: [{ type: 'text', text: 'Assistant' }] }
          ]
        })
      );
    });
  });

  describe('context length', () => {
    it('should have correct context length', () => {
      const model = new AnthropicModel();
      expect(model.contextLength).toBe(200000);
    });
  });
}); 
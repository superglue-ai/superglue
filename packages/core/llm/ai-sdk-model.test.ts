import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { getModelContextLength, initializeAIModel } from '@superglue/shared/utils';
import { generateText, jsonSchema, tool } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSdkModel } from './ai-sdk-model.js';
import { LLMMessage } from './llm-base-model.js';

vi.mock('ai');
vi.mock('@ai-sdk/openai');
vi.mock('@ai-sdk/anthropic');
vi.mock('@ai-sdk/google');
vi.mock('@superglue/shared/utils');

describe('AiSdkModel', () => {
  const mockGenerateText = vi.mocked(generateText);
  const mockTool = vi.mocked(tool);
  const mockJsonSchema = vi.mocked(jsonSchema);
  const MOCK_DATE = '2024-01-01T00:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MOCK_DATE));
    
    vi.mocked(initializeAIModel).mockReturnValue('mock-model');
    vi.mocked(getModelContextLength).mockReturnValue(128000);
    
    mockTool.mockImplementation((config: any) => ({ type: 'tool', config }) as any);
    mockJsonSchema.mockImplementation((schema: any) => schema as any);
    
    vi.mocked(openai.tools.webSearch).mockReturnValue({ type: 'web_search_openai' } as any);
    vi.mocked(anthropic.tools.webSearch_20250305).mockReturnValue({ type: 'web_search_anthropic' } as any);
    vi.mocked(google.tools.googleSearch).mockReturnValue({ type: 'web_search_google' } as any);
  });

  describe('constructor', () => {
    it('should initialize with default model', () => {
      const model = new AiSdkModel();
      
      expect(initializeAIModel).toHaveBeenCalledWith({
        providerEnvVar: 'LLM_PROVIDER',
        defaultModel: 'claude-sonnet-4-5'
      });
      expect(getModelContextLength).toHaveBeenCalledWith('claude-sonnet-4-5');
      expect(model.contextLength).toBe(128000);
    });

    it('should initialize with custom model', () => {
      const model = new AiSdkModel('gpt-4o');
      
      expect(initializeAIModel).toHaveBeenCalledWith({
        providerEnvVar: 'LLM_PROVIDER',
        defaultModel: 'gpt-4o'
      });
      expect(getModelContextLength).toHaveBeenCalledWith('gpt-4o');
    });
  });

  describe('generateText', () => {
    it('should generate text response', async () => {
      const model = new AiSdkModel();
      mockGenerateText.mockResolvedValue({
        text: 'test response',
        toolCalls: [],
        toolResults: []
      } as any);

      const messages = [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user message' }
      ] as LLMMessage[];

      const result = await model.generateText(messages);

      expect(mockGenerateText).toHaveBeenCalledWith({
        model: 'mock-model',
        messages: [
          { role: 'system', content: 'The current date and time is ' + MOCK_DATE },
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user message' }
        ],
        temperature: 0,
        maxRetries: 0,
        tools: undefined,
        toolChoice: undefined
      });
      expect(result.response).toBe('test response');
      expect(result.messages).toHaveLength(4);
      expect(result.messages[3]).toEqual({
        role: 'assistant',
        content: 'test response'
      });
    });

    it('should use custom temperature', async () => {
      const model = new AiSdkModel();
      mockGenerateText.mockResolvedValue({
        text: 'test response',
        toolCalls: [],
        toolResults: []
      } as any);

      await model.generateText([{ role: 'user', content: 'test' }], 0.7);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7
        })
      );
    });
  });

  describe('generateObject', () => {
    it('should generate object response with submit tool call', async () => {
      const model = new AiSdkModel();
      const responseObj = { key: 'value' };
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: responseObj
        }],
        toolResults: []
      } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const messages = [
        { role: 'user', content: 'test' }
      ] as LLMMessage[];

      const result = await model.generateObject({ messages: messages, schema: schema, temperature: 0 });

      expect(mockGenerateText).toHaveBeenCalled();
      const lastCall = mockGenerateText.mock.calls[mockGenerateText.mock.calls.length - 1][0];
      expect(lastCall).toMatchObject({
        model: 'mock-model',
        temperature: 0,
        toolChoice: 'required',
        maxRetries: 0
      });
      expect(lastCall.messages[0]).toEqual({ role: 'system', content: 'The current date and time is ' + MOCK_DATE });
      expect(lastCall.tools).toHaveProperty('submit');
      expect(lastCall.tools).toHaveProperty('abort');
      expect(result.response).toEqual(responseObj);
    });

    it('should handle result wrapped in result property', async () => {
      const model = new AiSdkModel();
      const responseObj = { key: 'value' };
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { result: responseObj }
        }],
        toolResults: []
      } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const result = await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema });

      expect(result.response).toEqual(responseObj);
    });

    it('should handle abort tool call', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'abort',
          input: { reason: 'Cannot complete request' }
        }],
        toolResults: []
      } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const result = await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema });

      expect(result.success).toBe(false);
      expect(result.response).toEqual('Cannot complete request');
    });

    it('should handle o-model temperature', async () => {
      const model = new AiSdkModel('o1-preview');
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { key: 'value' }
        }],
        toolResults: []
      } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema, temperature: 0.5 });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: undefined
        })
      );
    });

    it('should handle custom tools with context', async () => {
      const model = new AiSdkModel();
      const customToolExecute = vi.fn().mockResolvedValue({ success: true, data: 'custom tool result' });
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { key: 'value' }
        }],
        toolResults: []
      } as any);

      const customTools = [{
        toolDefinition: {
          name: 'custom_tool',
          description: 'A custom tool',
          arguments: {
            type: 'object' as const,
            properties: {
              param: { type: 'string' }
            }
          },
          execute: customToolExecute
        },
        toolContext: { contextData: 'test' }
      }];

      await model.generateObject(
        { messages: [{ role: 'user', content: 'test' }], schema: { type: 'object', properties: {} }, tools: customTools }
      );

      expect(mockGenerateText).toHaveBeenCalled();
      const lastCall = mockGenerateText.mock.calls[mockGenerateText.mock.calls.length - 1][0];
      expect(lastCall.tools).toHaveProperty('custom_tool');
    });

    it('should handle custom tools without context', async () => {
      const model = new AiSdkModel();
      const customToolExecute = vi.fn().mockResolvedValue({ success: true, data: 'custom tool result' });
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { key: 'value' }
        }],
        toolResults: []
      } as any);

      const customTools = [{
        toolDefinition: {
          name: 'custom_tool',
          description: 'A custom tool',
          arguments: {
            type: 'object' as const,
            properties: {
              param: { type: 'string' }
            }
          },
          execute: customToolExecute
        },
        toolContext: undefined
      }];

      await model.generateObject(
        { messages: [{ role: 'user', content: 'test' }], schema: { type: 'object', properties: {} }, tools: customTools }
      );

      expect(mockGenerateText).toHaveBeenCalled();
      const lastCall = mockGenerateText.mock.calls[mockGenerateText.mock.calls.length - 1][0];
      expect(lastCall.tools).toHaveProperty('custom_tool');
    });

    it('should handle web search tool as Record<string, Tool>', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { key: 'value' }
        }],
        toolResults: []
      } as any);

      const webSearchTools = [{
        toolDefinition: { web_search: { type: 'web_search_openai' } as any },
        toolContext: {}
      }];

      await model.generateObject(
        { messages: [{ role: 'user', content: 'test' }], schema: { type: 'object', properties: {} }, tools: webSearchTools }
      );

      expect(mockGenerateText).toHaveBeenCalled();
      const lastCall = mockGenerateText.mock.calls[mockGenerateText.mock.calls.length - 1][0];
      expect(lastCall.tools).toHaveProperty('web_search');
    });

    it('should handle multi-turn conversation with tool results', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText
        .mockResolvedValueOnce({
          text: 'thinking',
          toolCalls: [{
            toolCallId: 'call_web',
            toolName: 'web_search',
            input: { query: 'test' }
          }],
          toolResults: [{
            toolCallId: 'call_web',
            toolName: 'web_search',
            output: 'search results'
          }]
        } as any)
        .mockResolvedValueOnce({
          text: '',
          toolCalls: [{
            toolCallId: 'call_submit',
            toolName: 'submit',
            input: { key: 'value' }
          }],
          toolResults: []
        } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const result = await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema });

      expect(mockGenerateText).toHaveBeenCalledTimes(2);
      expect(result.response).toEqual({ key: 'value' });
      expect(result.messages.length).toBeGreaterThan(2);
    });

    it('should clean schema by removing patternProperties and setting strict mode', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { key: 'value' }
        }],
        toolResults: []
      } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        },
        patternProperties: {
          '^[a-z]+$': { type: 'string' }
        }
      };

      await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema });

      // Schema should be cleaned - we can't directly verify this but can check it doesn't throw
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it('should wrap array schema in object at root level', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { result: [{ key: 'value' }] }
        }],
        toolResults: []
      } as any);

      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' }
          }
        }
      };

      const result = await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema });

      expect(result.response).toEqual([{ key: 'value' }]);
    });

    it('should handle errors gracefully', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText.mockRejectedValue(new Error('API Error'));

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const result = await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema });

      expect(result.response).toContain('Error: Vercel AI API Error');
      expect(result.messages[result.messages.length - 1].content).toContain('Error: Vercel AI API Error');
    });

    it('should use custom toolChoice', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText.mockResolvedValue({
        text: '',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'submit',
          input: { key: 'value' }
        }],
        toolResults: []
      } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      await model.generateObject(
        { messages: [{ role: 'user', content: 'test' }], schema: schema, toolChoice: 'auto' }
      );

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          toolChoice: 'auto'
        })
      );
    });

    it('should throw error if no tool calls received', async () => {
      const model = new AiSdkModel();
      
      mockGenerateText.mockResolvedValue({
        text: 'just text',
        toolCalls: [],
        toolResults: []
      } as any);

      const schema = {
        type: 'object',
        properties: {
          key: { type: 'string' }
        }
      };

      const result = await model.generateObject({ messages: [{ role: 'user', content: 'test' }], schema: schema });

      expect(result.response).toContain('Error: Vercel AI API Error');
    });

    describe('maxUses', () => {
      it('should exclude tool after maxUses reached', async () => {
        const model = new AiSdkModel();
        const customToolExecute = vi.fn().mockResolvedValue({ success: true, data: 'result' });

        // First call: tool is used, second call: tool should be excluded, submit is called
        mockGenerateText
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{
              toolCallId: 'call_1',
              toolName: 'limited_tool',
              input: { param: 'first' }
            }],
            toolResults: [{
              toolCallId: 'call_1',
              toolName: 'limited_tool',
              output: 'first result'
            }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{
              toolCallId: 'call_2',
              toolName: 'submit',
              input: { key: 'done' }
            }],
            toolResults: []
          } as any);

        const customTools = [{
          toolDefinition: {
            name: 'limited_tool',
            description: 'A tool with limited uses',
            arguments: { type: 'object' as const, properties: { param: { type: 'string' } } },
            execute: customToolExecute
          },
          toolContext: {},
          maxUses: 1
        }];

        const result = await model.generateObject({
          messages: [{ role: 'user', content: 'test' }],
          schema: { type: 'object', properties: { key: { type: 'string' } } },
          tools: customTools
        });

        expect(mockGenerateText).toHaveBeenCalledTimes(2);

        // First call should have the limited_tool available
        const firstCallTools = mockGenerateText.mock.calls[0][0].tools;
        expect(firstCallTools).toHaveProperty('limited_tool');

        // Second call should NOT have the limited_tool (maxUses: 1 reached)
        const secondCallTools = mockGenerateText.mock.calls[1][0].tools;
        expect(secondCallTools).not.toHaveProperty('limited_tool');
        expect(secondCallTools).toHaveProperty('submit');
        expect(secondCallTools).toHaveProperty('abort');

        expect(result.response).toEqual({ key: 'done' });
      });

      it('should allow tool usage up to maxUses limit', async () => {
        const model = new AiSdkModel();
        const customToolExecute = vi.fn().mockResolvedValue({ success: true, data: 'result' });

        mockGenerateText
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{
              toolCallId: 'call_1',
              toolName: 'limited_tool',
              input: { param: 'first' }
            }],
            toolResults: [{ toolCallId: 'call_1', toolName: 'limited_tool', output: 'r1' }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{
              toolCallId: 'call_2',
              toolName: 'limited_tool',
              input: { param: 'second' }
            }],
            toolResults: [{ toolCallId: 'call_2', toolName: 'limited_tool', output: 'r2' }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{
              toolCallId: 'call_3',
              toolName: 'submit',
              input: { key: 'done' }
            }],
            toolResults: []
          } as any);

        const customTools = [{
          toolDefinition: {
            name: 'limited_tool',
            description: 'A tool with limited uses',
            arguments: { type: 'object' as const, properties: { param: { type: 'string' } } },
            execute: customToolExecute
          },
          toolContext: {},
          maxUses: 2
        }];

        await model.generateObject({
          messages: [{ role: 'user', content: 'test' }],
          schema: { type: 'object', properties: { key: { type: 'string' } } },
          tools: customTools
        });

        expect(mockGenerateText).toHaveBeenCalledTimes(3);

        // First and second calls should have limited_tool
        expect(mockGenerateText.mock.calls[0][0].tools).toHaveProperty('limited_tool');
        expect(mockGenerateText.mock.calls[1][0].tools).toHaveProperty('limited_tool');

        // Third call should NOT have limited_tool (used 2 times already)
        expect(mockGenerateText.mock.calls[2][0].tools).not.toHaveProperty('limited_tool');
      });

      it('should not limit tools without maxUses', async () => {
        const model = new AiSdkModel();
        const customToolExecute = vi.fn().mockResolvedValue({ success: true, data: 'result' });

        mockGenerateText
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{ toolCallId: 'c1', toolName: 'unlimited_tool', input: {} }],
            toolResults: [{ toolCallId: 'c1', toolName: 'unlimited_tool', output: 'r' }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{ toolCallId: 'c2', toolName: 'unlimited_tool', input: {} }],
            toolResults: [{ toolCallId: 'c2', toolName: 'unlimited_tool', output: 'r' }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{ toolCallId: 'c3', toolName: 'unlimited_tool', input: {} }],
            toolResults: [{ toolCallId: 'c3', toolName: 'unlimited_tool', output: 'r' }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{ toolCallId: 'c4', toolName: 'submit', input: { key: 'done' } }],
            toolResults: []
          } as any);

        const customTools = [{
          toolDefinition: {
            name: 'unlimited_tool',
            description: 'No limit',
            arguments: { type: 'object' as const, properties: {} },
            execute: customToolExecute
          },
          toolContext: {}
          // No maxUses specified
        }];

        await model.generateObject({
          messages: [{ role: 'user', content: 'test' }],
          schema: { type: 'object', properties: { key: { type: 'string' } } },
          tools: customTools
        });

        // All 4 calls should have unlimited_tool available
        for (let i = 0; i < 3; i++) {
          expect(mockGenerateText.mock.calls[i][0].tools).toHaveProperty('unlimited_tool');
        }
      });

      it('should track usage independently per tool', async () => {
        const model = new AiSdkModel();

        mockGenerateText
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{ toolCallId: 'c1', toolName: 'tool_a', input: {} }],
            toolResults: [{ toolCallId: 'c1', toolName: 'tool_a', output: 'r' }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{ toolCallId: 'c2', toolName: 'tool_b', input: {} }],
            toolResults: [{ toolCallId: 'c2', toolName: 'tool_b', output: 'r' }]
          } as any)
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{ toolCallId: 'c3', toolName: 'submit', input: { key: 'done' } }],
            toolResults: []
          } as any);

        const customTools = [
          {
            toolDefinition: {
              name: 'tool_a',
              description: 'Tool A',
              arguments: { type: 'object' as const, properties: {} },
              execute: vi.fn().mockResolvedValue({})
            },
            toolContext: {},
            maxUses: 1
          },
          {
            toolDefinition: {
              name: 'tool_b',
              description: 'Tool B',
              arguments: { type: 'object' as const, properties: {} },
              execute: vi.fn().mockResolvedValue({})
            },
            toolContext: {},
            maxUses: 1
          }
        ];

        await model.generateObject({
          messages: [{ role: 'user', content: 'test' }],
          schema: { type: 'object', properties: { key: { type: 'string' } } },
          tools: customTools
        });

        // First call: both tools available
        expect(mockGenerateText.mock.calls[0][0].tools).toHaveProperty('tool_a');
        expect(mockGenerateText.mock.calls[0][0].tools).toHaveProperty('tool_b');

        // Second call: tool_a used, so excluded; tool_b still available
        expect(mockGenerateText.mock.calls[1][0].tools).not.toHaveProperty('tool_a');
        expect(mockGenerateText.mock.calls[1][0].tools).toHaveProperty('tool_b');

        // Third call: both excluded
        expect(mockGenerateText.mock.calls[2][0].tools).not.toHaveProperty('tool_a');
        expect(mockGenerateText.mock.calls[2][0].tools).not.toHaveProperty('tool_b');
      });
    });
  });
});


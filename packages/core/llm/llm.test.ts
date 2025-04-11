import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModel } from './llm.js';

// Mock the entire modules
vi.mock('./openai-model.js');
vi.mock('./gemini-model.js');

// Import after mocking
import { OpenAIModel } from './openai-model.js';
import { GeminiModel } from './gemini-model.js';

describe('LLM', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset module imports between tests
    vi.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('selectLanguageModel', () => {
    it('should return OpenAIModel when LLM_PROVIDER is OPENAI', async () => {
      process.env.LLM_PROVIDER = 'OPENAI';
      const { LanguageModel } = await import('./llm.js');
      expect(LanguageModel).toBeInstanceOf(OpenAIModel);
    });

    it('should return GeminiModel when LLM_PROVIDER is GEMINI', async () => {
      process.env.LLM_PROVIDER = 'GEMINI';
      const { LanguageModel } = await import('./llm.js');
      expect(LanguageModel).toBeInstanceOf(GeminiModel);
    });

    it('should default to OpenAIModel when LLM_PROVIDER is invalid', async () => {
      process.env.LLM_PROVIDER = 'INVALID';
      const { LanguageModel } = await import('./llm.js');
      expect(LanguageModel).toBeInstanceOf(OpenAIModel);
    });

    it('should default to OpenAIModel when LLM_PROVIDER is undefined', async () => {
      process.env.LLM_PROVIDER = undefined;
      const { LanguageModel } = await import('./llm.js');
      expect(LanguageModel).toBeInstanceOf(OpenAIModel);
    });

    it('should work with lowercase LLM_PROVIDER values', async () => {
      process.env.LLM_PROVIDER = 'openai';
      const { LanguageModel } = await import('./llm.js');
      expect(LanguageModel).toBeInstanceOf(OpenAIModel);
    });
  });
});

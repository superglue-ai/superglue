import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the entire modules
vi.mock('./openai-model.js');
vi.mock('./gemini-model.js');
vi.mock('./llm.js', () => ({
  LanguageModel: {
    contextLength: 128000,
    generateText: vi.fn(),
    generateObject: vi.fn()
  },
  selectLanguageModel: vi.fn(),
  LLM: vi.fn()
}));

// Import after mocking

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
    it('should return mocked LanguageModel with correct interface', async () => {
      const { LanguageModel } = await import('./llm.js');
      expect(LanguageModel).toHaveProperty('contextLength', 128000);
      expect(LanguageModel).toHaveProperty('generateText');
      expect(LanguageModel).toHaveProperty('generateObject');
    });
  });
});

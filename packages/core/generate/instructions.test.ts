import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModel } from '../llm/language-model.js';
import { generateInstructionsImplementation, sanitizeInstructionSuggestions } from './instructions.js';

vi.mock('../llm/language-model.js', () => {
  return {
    LanguageModel: {
      generateObject: vi.fn().mockImplementation(async (messages, _, temperature) => {
        return {
          response: [
            "Process a payment using Stripe",
            "Send a welcome email via SendGrid",
            "Process payment and send receipt email"
          ],
          messages: []
        }
      })
    }
  };
});

describe('generateInstructionsImplementation', () => {
  const originalEnv = { ...process.env }

  // Test data
  const integrations = [
    {
      id: "stripe",
      urlHost: "https://api.stripe.com",
      documentation: "Payment processing API",
      credentials: {}
    },
    {
      id: "sendgrid",
      urlHost: "https://api.sendgrid.com",
      documentation: "Email service API",
      credentials: {}
    }
  ]
  const expectedInstructions = [
    "Process a payment using Stripe",
    "Send a welcome email via SendGrid",
    "Process payment and send receipt email"
  ]

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_MODEL = 'gpt-4'
    vi.resetAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should generate valid instructions (happy path)', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)
    generateObject.mockResolvedValueOnce({ response: expectedInstructions, messages: [] })

    const result = await generateInstructionsImplementation({ integrations }, { orgId: 'test-org', runId: 'test-run', integrations })
    expect(result.success).toBe(true)
    expect(result.data).toEqual(expectedInstructions)
    expect(LanguageModel.generateObject).toHaveBeenCalledTimes(1)
  })

  it('should handle empty response gracefully', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)
    generateObject.mockResolvedValueOnce({ response: [], messages: [] })

    const result = await generateInstructionsImplementation({ integrations }, { orgId: 'test-org', runId: 'test-run', integrations })
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('should handle malformed response', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)
    generateObject.mockResolvedValueOnce({ response: "not an array", messages: [] })

    const result = await generateInstructionsImplementation({ integrations }, { orgId: 'test-org', runId: 'test-run', integrations })
    expect(result.success).toBe(true)
    expect(result.data).toEqual(["not an array"])
  })

  it('should use correct temperature', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)
    generateObject.mockResolvedValueOnce({ response: expectedInstructions, messages: [] })

    await generateInstructionsImplementation({ integrations }, { orgId: 'test-org', runId: 'test-run', integrations })

    expect(generateObject).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      0.2
    )
  })
})

describe('sanitizeInstructionSuggestions', () => {
  it('returns a clean array for a proper array of strings', () => {
    const input = [
      'Get all users',
      'Fetch all orders',
      'Sync data'
    ];
    expect(sanitizeInstructionSuggestions(input)).toEqual([
      'Get all users',
      'Fetch all orders',
      'Sync data'
    ]);
  });

  it('parses a JSON stringified array', () => {
    const input = '["A", "B", "C"]';
    expect(sanitizeInstructionSuggestions(input)).toEqual(['A', 'B', 'C']);
  });

  it('splits a single string with newlines and bullets', () => {
    const input = '- Get all users\n- Fetch all orders\n- Sync data';
    expect(sanitizeInstructionSuggestions(input)).toEqual([
      'Get all users',
      'Fetch all orders',
      'Sync data'
    ]);
  });

  it('removes headers and markdown from array (classic)', () => {
    const input = [
      '**Individual Suggestions:**',
      '- Get all users',
      '- Fetch all orders',
      '**Integration Suggestions:**',
      '- Sync data'
    ];
    expect(sanitizeInstructionSuggestions(input)).toEqual([
      'Get all users',
      'Fetch all orders',
      'Sync data'
    ]);
  });

  it('removes headers and markdown from array (various cases)', () => {
    const input = [
      '# Example Output',
      '## Integration Suggestions',
      '---',
      '***',
      'Output:',
      'Example:',
      'Individual Suggestions',
      'Integration Suggestions',
      'Get all users',
      'Fetch all orders',
      'Sync data',
      '***Integration Suggestions***',
      '   ##   Example Output   ',
      '   * Individual Suggestions *   ',
      '   # Output:   ',
      '   ----   ',
      '   ***   ',
      '   ',
      '',
      '   #   ',
      '   *   ',
      '   -   ',
      '   _   ',
      '   >   ',
      '   > Output:',
      '   > Example:',
      '   > Integration Suggestions',
      '   > Individual Suggestions',
      '   > # Example Output',
      '   > ## Integration Suggestions',
      '   > ---',
      '   > ***',
      '   > Output:',
      '   > Example:',
      '   > Individual Suggestions',
      '   > Integration Suggestions',
      '   > Get all users',
      '   > Fetch all orders',
      '   > Sync data',
    ];
    expect(sanitizeInstructionSuggestions(input)).toEqual([
      'Get all users',
      'Fetch all orders',
      'Sync data'
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(sanitizeInstructionSuggestions('')).toEqual([]);
    expect(sanitizeInstructionSuggestions([])).toEqual([]);
    expect(sanitizeInstructionSuggestions(null)).toEqual([]);
    expect(sanitizeInstructionSuggestions(undefined)).toEqual([]);
  });

  it('handles malformed JSON gracefully', () => {
    expect(sanitizeInstructionSuggestions('["A", "B",')).toEqual(['["A", "B",']);
  });

  it('returns empty array if sanitizer throws', () => {
    // Simulate a toString that throws
    const evil = {
      toString() { throw new Error('fail'); }
    };
    let result: string[];
    try {
      result = sanitizeInstructionSuggestions(evil);
    } catch {
      result = ['should not throw'];
    }
    expect(result).toEqual([]);
  });

  it('handles non-string, non-array input', () => {
    expect(sanitizeInstructionSuggestions(42)).toEqual([]);
    expect(sanitizeInstructionSuggestions({ foo: 'bar' })).toEqual([]);
  });
}) 
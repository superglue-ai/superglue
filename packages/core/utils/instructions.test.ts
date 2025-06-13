import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModel } from '../llm/llm.js';
import { generateInstructions, sanitizeInstructionSuggestions } from './instructions.js';

vi.mock('../llm/llm.js', () => {
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

describe('generateInstructions', () => {
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

    const instructions = await generateInstructions(integrations, { orgId: 'test-org' })
    expect(instructions).toEqual(expectedInstructions)
    expect(LanguageModel.generateObject).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and succeed on second attempt', async () => {
    const errorMessage = 'Test error message'
    const generateObject = vi.mocked(LanguageModel.generateObject)

    // First call fails
    generateObject.mockRejectedValueOnce(new Error(errorMessage))
    // Second call succeeds
    generateObject.mockResolvedValueOnce({ response: expectedInstructions, messages: [] })

    const instructions = await generateInstructions(integrations, { orgId: 'test-org' })
    expect(instructions).toEqual(expectedInstructions)
    expect(generateObject).toHaveBeenCalledTimes(2)

    const secondCallArgs = generateObject.mock.calls[1][0]
    const lastMessage = secondCallArgs[secondCallArgs.length - 1]
    expect(lastMessage.content).toContain(errorMessage)
  })


  it('should increase temperature on retries', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)

    // Make it fail twice
    generateObject.mockRejectedValueOnce(new Error('First failure'))
    generateObject.mockRejectedValueOnce(new Error('Second failure'))
    generateObject.mockResolvedValueOnce({ response: expectedInstructions, messages: [] })

    await generateInstructions(integrations, { orgId: 'test-org' })

    // Check that temperature increased with each retry
    expect(generateObject).toHaveBeenNthCalledWith(1, expect.any(Array), expect.any(Object), 0)
    expect(generateObject).toHaveBeenNthCalledWith(2, expect.any(Array), expect.any(Object), 0.3)
    expect(generateObject).toHaveBeenNthCalledWith(3, expect.any(Array), expect.any(Object), 0.6)
  })

  it('should fail after max retries', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)
    const error = new Error('Persistent error')

    // Make it fail consistently
    generateObject.mockRejectedValue(error)

    await expect(generateInstructions(integrations, { orgId: 'test-org' })).rejects.toThrow('Persistent error')
    expect(generateObject).toHaveBeenCalledTimes(4) // Initial try + 3 retries
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
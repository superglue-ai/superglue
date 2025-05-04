import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateInstructions } from './instructions.js'
import { LanguageModel } from '../llm/llm.js';

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
  const systems = [
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

    const instructions = await generateInstructions(systems, { orgId: 'test-org' })
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

    const instructions = await generateInstructions(systems, { orgId: 'test-org' })
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

    await generateInstructions(systems, { orgId: 'test-org' })

    // Check that temperature increased with each retry
    expect(generateObject).toHaveBeenNthCalledWith(1, expect.any(Array), null, 0)
    expect(generateObject).toHaveBeenNthCalledWith(2, expect.any(Array), null, 0.3)
    expect(generateObject).toHaveBeenNthCalledWith(3, expect.any(Array), null, 0.6)
  })

  it('should fail after max retries', async () => {
    const generateObject = vi.mocked(LanguageModel.generateObject)
    const error = new Error('Persistent error')
    
    // Make it fail consistently
    generateObject.mockRejectedValue(error)

    await expect(generateInstructions(systems, { orgId: 'test-org' })).rejects.toThrow('Persistent error')
    expect(generateObject).toHaveBeenCalledTimes(4) // Initial try + 3 retries
  })
}) 
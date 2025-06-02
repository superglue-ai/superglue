import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LanguageModel } from "../llm/llm.js";
import { SystemDefinition } from "../workflow/workflow-builder.js";
import { logMessage } from "./logs.js";

export async function generateInstructions(systems: SystemDefinition[], metadata: { orgId: string }): Promise<string[]> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an expert at suggesting specific, implementable workflows combining different APIs and systems. Given a set of systems, suggest natural language instructions that can be directly built into workflows, with a focus on data retrieval and practical integrations.

For each system, provide 1-2 specific retrieval-focused examples. Then, suggest 3-4 detailed integration workflows that combine multiple systems. Each suggestion should be specific enough to implement directly, including key data points or criteria to use.

Example output for Stripe + MongoDB systems:
Individual suggestions:
- "Retrieve all Stripe customers who have spent over $1000 in the last 30 days"
- "Find MongoDB documents where subscription_status is 'past_due'"

Integration suggestions:
- "When a customer's total spend in Stripe exceeds $5000, fetch their order history from MongoDB and update their loyalty tier"
- "Query MongoDB for all users with premium_status=true and verify their Stripe subscription is still active"
- "Retrieve failed Stripe payments from the last 24 hours and cross-reference with customer engagement data in MongoDB"

Return the suggestions as an array of strings, each representing a specific, implementable instruction.
Remember this important rule: Do not think long and keep each instruction concise and simple, with maximum 4 options total (not per system).
`
    },
    {
      role: "user",
      content: `Systems: ${JSON.stringify(systems, null, 2)}`
    }
  ];

  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      logMessage('info', `Generating instructions${retryCount ? `: (retry ${retryCount})` : ""}`, metadata);
      const instructions = await attemptInstructionGeneration(messages, retryCount);
      return instructions;
    } catch (error) {
      retryCount++;
      if (retryCount > MAX_RETRIES) {
        logMessage('error', `Instruction generation failed after ${MAX_RETRIES} retries. Last error: ${error.message}`, metadata);
        throw error;
      }
      logMessage('warn', `Instruction generation failed. Retrying...`, metadata);
      messages.push({
        role: "user",
        content: `The previous attempt failed with error: ${error.message}. Please try again.`
      });
    }
  }
  throw new Error("Unexpected error in instruction generation");
}

async function attemptInstructionGeneration(
  messages: ChatCompletionMessageParam[],
  retry: number
): Promise<string[]> {
  let temperature = Math.min(0.3 * retry, 1.0);
  const schema = {
    type: "array",
    items: {
      type: "string"
    }
  }
  const { response: generatedInstructions } = await LanguageModel.generateObject(messages, schema, temperature);

  if (!Array.isArray(generatedInstructions) || generatedInstructions.length === 0) {
    throw new Error("No valid instructions generated");
  }

  return generatedInstructions;
}
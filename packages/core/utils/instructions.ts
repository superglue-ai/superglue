import type { Integration } from "@superglue/client";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LanguageModel } from "../llm/llm.js";
import { BaseToolContext, ToolDefinition, ToolImplementation } from "../tools/tools.js";
import { Documentation } from "./documentation.js";

// Extend context to include integrations
export interface InstructionGenerationContext extends BaseToolContext {
  integrations: Integration[];
}

export const generateInstructionsDefinition: ToolDefinition = {
  name: "generate_instructions",
  description: "Generate specific, implementable workflow instructions for the available integrations.",
  arguments: {
    type: "object",
    properties: {},
    required: []
  }
};

export const generateInstructionsImplementation: ToolImplementation<InstructionGenerationContext> = async (args, context) => {
  const { integrations } = context;

  if (!integrations || integrations.length === 0) {
    return {
      resultForAgent: {
        success: false,
        error: "No integrations provided in context"
      },
      fullResult: {
        success: false,
        error: "No integrations provided in context"
      }
    };
  }

  // Prepare integration summaries with smart documentation truncation
  const integrationSummaries = integrations.map(integration => {
    // Use Documentation.extractRelevantSections to intelligently truncate documentation
    // Focus on getting started, authentication, and basic operations
    const truncatedDocs = integration.documentation
      ? Documentation.extractRelevantSections(
        integration.documentation,
        "getting started overview endpoints reference",
        10,  // max_chunks
        1000 // chunk_size - smaller chunks for summaries
      )
      : "";

    return {
      id: integration.id,
      urlHost: integration.urlHost,
      urlPath: integration.urlPath,
      // Take first 500 chars of truncated docs as summary
      documentation: truncatedDocs.slice(0, 500) + (truncatedDocs.length > 500 ? "..." : ""),
      documentationUrl: integration.documentationUrl
    };
  });

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an expert at suggesting specific, implementable workflows combining different APIs and integrations. Given a set of integrations, suggest natural language instructions that can be directly built into workflows, with a focus on data retrieval and practical integrations.

For each integration, provide 1-2 specific retrieval-focused examples. Then, suggest 1-2 detailed integration workflows that combine multiple integrations. Each suggestion should be specific enough to implement directly, including key data points or criteria to use. However, never return more than 5 suggestions total.ßß

**Important:** Return ONLY a JSON array of strings. Do NOT include any section headers, markdown, bullet points, numbers, or explanations. Each string in the array should be a single, specific, implementable instruction.

**Example output:**
[
  "Retrieve all Stripe customers who have spent over $1000 in the last 30 days.",
  "Find MongoDB documents where subscription_status is 'past_due'.",
  "When a customer's total spend in Stripe exceeds $5000, fetch their order history from MongoDB and update their loyalty tier.",
  "Query MongoDB for all users with premium_status=true and verify their Stripe subscription is still active."
]

Remember these important rules: The output MUST be a JSON array of strings, with no extra formatting or explanation. Do not think long and keep each instruction concise and simple, with maximum 4 options total (not per integration).`
    },
    {
      role: "user",
      content: `integrations: ${JSON.stringify(integrationSummaries, null, 2)}`
    }
  ];

  const schema = {
    type: "array",
    items: { type: "string" }
  };

  const { response: generatedInstructions } = await LanguageModel.generateObject(messages, schema, 0.2);
  return {
    resultForAgent: {
      success: true,
      instructions: sanitizeInstructionSuggestions(generatedInstructions)
    },
    fullResult: {
      success: true,
      instructions: sanitizeInstructionSuggestions(generatedInstructions)
    }
  };
};

export function sanitizeInstructionSuggestions(raw: unknown): string[] {
  let arr: string[] = [];

  // Try to parse JSON if it's a string
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
      else arr = [parsed];
    } catch {
      arr = [raw];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }

  // Flatten any multi-line strings
  arr = arr.flatMap((item) =>
    typeof item === "string" ? item.split(/\r?\n/).map((s) => s.trim()) : []
  );

  // Remove empty, header, or markdown lines
  const headerRegex = /^(\s*[#>*-]+\s*)?((integration suggestions|individual suggestions|example output|example:|output:)[^a-zA-Z0-9]*|[\-*#_]{2,}|\s*)$/i;

  // Remove lines that are just markdown separators or bullets
  const isSeparator = (line: string) => {
    const trimmed = line.trim();
    // Remove if only made up of separator chars, or is a single separator char
    return (
      /^[\s\-_*>#]+$/.test(trimmed) ||
      ["_", "-", "*", ">", "#"].includes(trimmed)
    );
  };

  // Format, filter, and deduplicate
  const seen = new Set<string>();
  const filtered = arr
    .map((s) =>
      s
        .replace(/^[-*#>\s]+/, "") // Remove leading markdown symbols and whitespace
        .replace(/[-*#>\s]+$/, "") // Remove trailing markdown symbols and whitespace
        .replace(/^"|"$/g, "") // Remove leading/trailing quotes
        .trim()
    )
    .filter(
      (s) =>
        s.length > 0 &&
        !headerRegex.test(s) &&
        !isSeparator(s) &&
        !seen.has(s) &&
        seen.add(s)
    );

  return filtered;
}
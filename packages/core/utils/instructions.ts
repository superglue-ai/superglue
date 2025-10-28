import type { Integration } from "@superglue/client";
import { GENERATE_INSTRUCTIONS_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { BaseToolContext, ToolDefinition, ToolImplementation } from "../execute/tools.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { parseJSON } from "./json-parser.js";

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
      success: false,
      error: "No integrations provided in context"
    };
  }

  // Prepare integration summaries with smart documentation truncation
  const integrationSummaries = integrations.map(integration => {
    // Use DocumentationSearch to intelligently truncate documentation
    // Focus on getting started, authentication, and basic operations
    const documentationSearch = new DocumentationSearch({ orgId: context.orgId });
    const truncatedDocs = integration.documentation
      ? documentationSearch.extractRelevantSections(
        integration.documentation,
        "getting started overview endpoints reference",
        10,  // max_chunks
        1000, // chunk_size - smaller chunks for summaries
        integration.openApiSchema
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

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: GENERATE_INSTRUCTIONS_SYSTEM_PROMPT
    },
    {
      role: "user",
      content: `<integrations>${JSON.stringify(integrationSummaries, null, 2)}</integrations>`
    }
  ];

  const schema = {
    type: "array",
    items: { type: "string" }
  };

  const { response: generatedInstructions, error: generatedInstructionsError } = await LanguageModel.generateObject(messages, schema, 0.2);

  if (generatedInstructionsError || generatedInstructions?.error) {
    throw new Error(`Error generating instructions: ${generatedInstructionsError || generatedInstructions?.error}`);
  }
  
  return {
    success: true,
    data: sanitizeInstructionSuggestions(generatedInstructions)
  };
};

export function sanitizeInstructionSuggestions(raw: unknown): string[] {
  let arr: string[] = [];

  // Try to parse JSON if it's a string
  if (typeof raw === "string") {
    try {
      const parsed = parseJSON(raw);
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
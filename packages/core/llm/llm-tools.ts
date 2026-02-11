import { tavilySearch } from "@tavily/ai-sdk";
import { System, ServiceMetadata } from "@superglue/shared";
import { LLMToolDefinition, LLMToolImplementation } from "./llm-tool-utils.js";
import { SystemManager } from "../systems/system-manager.js";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { sanitizeInstructionSuggestions, runCodeInIVM } from "../utils/helpers.js";
import { LanguageModel, LLMMessage } from "./llm-base-model.js";
import { GENERATE_INSTRUCTIONS_SYSTEM_PROMPT } from "../context/context-prompts.js";

export function getWebSearchTool(): any {
  if (!process.env.TAVILY_API_KEY) {
    return null;
  }
  return tavilySearch({
    searchDepth: "advanced",
    maxResults: 5,
    includeAnswer: true,
  });
}

export interface searchDocumentationToolContext extends ServiceMetadata {
  system: System;
}

export const searchDocumentationToolImplementation: LLMToolImplementation<
  searchDocumentationToolContext
> = async (args, context) => {
  const { query } = args;
  const { system, ...metadata } = context;

  if (!system) {
    return {
      success: false,
      error:
        "System not provided in context. The search_documentation tool requires a system to be passed in the tool executor context.",
    };
  }

  try {
    if (!system.documentation && !system.openApiSchema && !system.specificInstructions) {
      return {
        success: true,
        data: {
          systemId: system.id,
          query,
          summary:
            "No documentation available for this system. Try to execute the API call without documentation using your own knowledge or web search. Do not use the search_documentation tool.",
        },
      };
    }
    const systemManager = SystemManager.fromSystem(system, null, metadata);
    const searchResults = await systemManager.searchDocumentation(query);

    // Handle empty results or no documentation
    if (
      !searchResults ||
      searchResults.trim().length === 0 ||
      searchResults === "no documentation provided"
    ) {
      return {
        success: true,
        data: {
          systemId: system.id,
          query,
          summary: `No relevant sections found for keywords: "${query}". Try different or broader keywords, or verify that the documentation contains information about what you're looking for.`,
        },
      };
    }

    return {
      success: true,
      data: {
        systemId: system.id,
        query,
        summary: searchResults,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const searchDocumentationToolDefinition: LLMToolDefinition = {
  name: "search_documentation",
  description:
    "Search documentation for specific information about API structure, endpoints, authentication patterns, etc. Use this when you need to understand how an API works, what endpoints are available, or how to authenticate. Returns relevant documentation excerpts matching your search query.",
  arguments: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "What to search for in the documentation (e.g., 'authentication', 'batch processing', 'rate limits')",
      },
    },
    required: ["query"],
  },
  execute: searchDocumentationToolImplementation,
};

export interface InstructionGenerationContext extends ServiceMetadata {
  systems: System[];
}

export const generateInstructionsToolImplementation: LLMToolImplementation<
  InstructionGenerationContext
> = async (args, context) => {
  const { systems } = context;
  const metadata = context as ServiceMetadata;

  if (!systems || systems.length === 0) {
    return {
      success: false,
      error: "No systems provided in context",
    };
  }

  // Prepare system summaries with smart documentation truncation
  const systemSummaries = systems.map((system) => {
    // Use DocumentationSearch to intelligently truncate documentation
    // Focus on getting started, authentication, and basic operations
    const documentationSearch = new DocumentationSearch(metadata);
    let truncatedDocs = system.documentation
      ? documentationSearch.extractRelevantSections(
          system.documentation,
          "getting started overview endpoints reference",
          10, // max_chunks
          1000, // chunk_size - smaller chunks for summaries
          system.openApiSchema,
        )
      : "";

    // Always append specific instructions if they exist
    if (system.specificInstructions && system.specificInstructions.trim().length > 0) {
      if (truncatedDocs) {
        truncatedDocs =
          truncatedDocs +
          "\n\n=== SPECIFIC INSTRUCTIONS ===\n\n" +
          system.specificInstructions.trim();
      } else {
        truncatedDocs = "=== SPECIFIC INSTRUCTIONS ===\n\n" + system.specificInstructions.trim();
      }
    }

    return {
      id: system.id,
      url: system.url,
      documentation: truncatedDocs.slice(0, 1000) + (truncatedDocs.length > 1000 ? "..." : ""),
      documentationUrl: system.documentationUrl,
    };
  });

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: GENERATE_INSTRUCTIONS_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `<systems>${JSON.stringify(systemSummaries, null, 2)}</systems>`,
    },
  ];

  const schema = {
    type: "array",
    items: { type: "string" },
  };

  const result = await LanguageModel.generateObject<string[]>({
    messages,
    schema,
    temperature: 0.2,
    metadata,
  });

  if (!result.success) {
    throw new Error(`Error generating instructions: ${result.response}`);
  }

  return {
    success: true,
    data: sanitizeInstructionSuggestions(result.response),
  };
};

export const generateInstructionsToolDefinition: LLMToolDefinition = {
  name: "generate_instructions",
  description: "Generate specific, implementable workflow instructions for the available systems.",
  arguments: {
    type: "object",
    properties: {},
    required: [],
  },
};

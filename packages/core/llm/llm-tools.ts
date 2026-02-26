import { tavilySearch } from "@tavily/ai-sdk";
import { System, ServiceMetadata } from "@superglue/shared";
import { LLMToolDefinition, LLMToolImplementation } from "./llm-tool-utils.js";
import { SystemManager } from "../systems/system-manager.js";

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

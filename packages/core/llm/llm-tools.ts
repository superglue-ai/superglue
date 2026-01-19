import { tavilySearch } from "@tavily/ai-sdk";
import { System, ServiceMetadata } from "@superglue/shared";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { LLMToolDefinition, LLMToolImplementation } from "./llm-tool-utils.js";
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
    if (!system.documentation || system.documentation.length <= 50) {
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

    const documentationSearch = new DocumentationSearch(metadata);
    const searchResults = documentationSearch.extractRelevantSections(
      system.documentation,
      query,
      5,
      2000,
      system.openApiSchema,
    );

    return {
      success: true,
      data: {
        systemId: system.id,
        query,
        summary: searchResults || "No matches found for your query.",
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
    const truncatedDocs = system.documentation
      ? documentationSearch.extractRelevantSections(
          system.documentation,
          "getting started overview endpoints reference",
          10, // max_chunks
          1000, // chunk_size - smaller chunks for summaries
          system.openApiSchema,
        )
      : "";

    return {
      id: system.id,
      urlHost: system.urlHost,
      urlPath: system.urlPath,
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
  description:
    "Generate specific, implementable workflow instructions for the available systems.",
  arguments: {
    type: "object",
    properties: {},
    required: [],
  },
};

export interface inspectSourceDataToolContext extends ServiceMetadata {
  sourceData: JSON;
}

export const inspectSourceDataToolImplementation: LLMToolImplementation<
  inspectSourceDataToolContext
> = async (args, context) => {
  const { sourceData } = context;
  const { expression } = args;
  const MAX_RESULT_CHARACTERS = 10000;

  if (!sourceData || typeof sourceData !== "object") {
    return "Error: No sourceData provided in context or it's not an object";
  }

  if (!expression || !expression.startsWith("sourceData =>")) {
    return "Error: Expression must be a sourceData arrow function, e.g. sourceData => sourceData.key";
  }

  try {
    const result = await runCodeInIVM(sourceData, expression);

    if (!result.success) {
      return `Error: ${result.error || "Failed to run expression"}`;
    }

    let output = JSON.stringify(result.data);

    if (output.length > MAX_RESULT_CHARACTERS) {
      output = output.slice(0, MAX_RESULT_CHARACTERS) + "... [truncated]";
    }

    return output;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

export const inspectSourceDataToolDefinition: LLMToolDefinition = {
  name: "inspect_source_data",
  description:
    "Inspect specific parts of sourceData by running a JS expression. Results are truncated to 10000 chars, so be TARGETED - don't return the entire object. You can start by exploring structure (Object.keys), then drill into specific paths. Examples: 'sourceData => Object.keys(sourceData)' to see top-level keys, 'sourceData => sourceData.users?.length' to check array size, 'sourceData => sourceData.users?.[0]' to see first item structure.",
  arguments: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          "A JS arrow function code expression to execute on sourceData, e.g. sourceData => sourceData.currentItem.id",
      },
    },
    required: ["expression"],
  },
  execute: inspectSourceDataToolImplementation,
};

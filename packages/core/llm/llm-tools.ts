import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { BaseLLMToolContext, LLMToolDefinition, LLMToolImplementation } from "./llm-tool-utils.js";
import { sanitizeInstructionSuggestions } from "../utils/tools.js";
import { LanguageModel, LLMMessage } from "./llm-base-model.js";
import { GENERATE_INSTRUCTIONS_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { Integration } from "@superglue/client";

export function getWebSearchTool(): any {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    switch (provider) {
        case 'openai':
            return openai.tools.webSearch();
        case 'anthropic':
            return anthropic.tools.webSearch_20250305({ maxUses: 5 });
        case 'gemini':
            return google.tools.googleSearch({});
        default:
            return null;
    }
}

export interface searchDocumentationToolContext extends BaseLLMToolContext {
  integration: Integration;
}

export const searchDocumentationToolImplementation: LLMToolImplementation<searchDocumentationToolContext> = async (args, context) => {
    const { query } = args;
    const { integration } = context;

    if (!integration) {
        return {
            success: false,
            error: "Integration not provided in context. The search_documentation tool requires an integration to be passed in the tool executor context."
        };
    }

    try {
        if (!integration.documentation || integration.documentation.length <= 50) {
            return {
                success: true,
                data: {
                    integrationId: integration.id,
                    query,
                    summary: "No documentation available for this integration. Try to execute the API call without documentation using your own knowledge or web search. Do not use the search_documentation tool."
                }
            };
        }

        const documentationSearch = new DocumentationSearch({ orgId: context.orgId });
        const searchResults = documentationSearch.extractRelevantSections(
            integration.documentation,
            query,
            5,
            2000,
            integration.openApiSchema
        );

        return {
            success: true,
            data: {
                integrationId: integration.id,
                query,
                summary: searchResults || "No matches found for your query."
            }
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
};

export const searchDocumentationToolDefinition: LLMToolDefinition = {
    name: "search_documentation",
    description: "Search documentation for specific information about API structure, endpoints, authentication patterns, etc. Use this when you need to understand how an API works, what endpoints are available, or how to authenticate. Returns relevant documentation excerpts matching your search query.",
    arguments: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "What to search for in the documentation (e.g., 'authentication', 'batch processing', 'rate limits')"
            }
        },
        required: ["query"]
    },
    execute: searchDocumentationToolImplementation
};

export interface InstructionGenerationContext extends BaseLLMToolContext {
    integrations: Integration[];
}
  
export const generateInstructionsImplementation: LLMToolImplementation<InstructionGenerationContext> = async (args, context) => {
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
        documentation: truncatedDocs.slice(0, 1000) + (truncatedDocs.length > 1000 ? "..." : ""),
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
  
    const result = await LanguageModel.generateObject<string[]>({messages, schema, temperature: 0.2});
  
    if (!result.success) {
      throw new Error(`Error generating instructions: ${result.response}`);
    }
  
    return {
      success: true,
      data: sanitizeInstructionSuggestions(result.response)
    };
};

export const generateInstructionsDefinition: LLMToolDefinition = {
    name: "generate_instructions",
    description: "Generate specific, implementable workflow instructions for the available integrations.",
    arguments: {
      type: "object",
      properties: {},
      required: []
    }
};
import type { ApiConfig } from "@superglue/client";
import { Message } from "@superglue/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel } from "../llm/llm.js";
import { SELF_HEALING_CODE_CONFIG_AGENT_PROMPT } from "../llm/prompts.js";
import { parseJSON } from "../utils/json-parser.js";
import { sample } from "../utils/tools.js";
import { BaseToolContext, ToolDefinition, ToolImplementation } from "./tools.js";

export interface ConfigGenerationContext extends BaseToolContext {
    apiConfig: Partial<ApiConfig>,
    inputData: Record<string, any>,
    credentials: Record<string, any>,
    retryCount?: number,
    messages?: Message[],
    integrationManager: IntegrationManager,
}

export interface CodeConfig {
    instruction?: string;
    code: string;
    pagination?: {
        type: "OFFSET_BASED" | "PAGE_BASED" | "CURSOR_BASED";
        pageSize: string;
        handler: string;  // "(response, pageInfo) => ({ hasMore, cursor? })"
    };
}

export const generateConfigDefinition: ToolDefinition = {
  name: "generate_code_config",
  description: "Generate code configuration for API calls with self-healing capabilities.",
  arguments: {
    type: "object",
    properties: {},
    required: []
  }
};

export const generateConfigImplementation: ToolImplementation<ConfigGenerationContext> = async (args, context) => {
    const { inputData, credentials, retryCount, integrationManager } = context;

    if (!retryCount) context.retryCount = 0;
    if (!context.messages) context.messages = [];

    const codeConfig = context.apiConfig as any;
    const messages = context.messages as Message[];

    if (messages.length === 0) {
        const fullDocs = await integrationManager?.getDocumentation();
        const documentation = fullDocs?.content?.length < LanguageModel.contextLength / 4 ?
            fullDocs?.content :
            await integrationManager?.searchDocumentation(codeConfig?.instruction || '');
        
        let payloadString = JSON.stringify(inputData || {});
        if (payloadString.length > LanguageModel.contextLength / 10) {
            payloadString = JSON.stringify(sample(inputData || {}, 5)).slice(0, LanguageModel.contextLength / 10);
        }

        const integration = await integrationManager?.getIntegration();
        const baseUrl = integration ? `${integration.urlHost}${integration.urlPath || ''}` : '';

        const userPrompt = `Generate code configuration for the following:

<instruction>
${codeConfig?.instruction || 'Execute API call'}
</instruction>

<user_provided_information>
${baseUrl ? `Base URL: ${baseUrl}` : ''}
${codeConfig?.code ? `Previous code attempt:\n${codeConfig.code}` : ''}
${codeConfig?.pagination ? `Pagination config: ${JSON.stringify(codeConfig.pagination, null, 2)}` : ''}
</user_provided_information>

<integration_instructions>  
${integration?.specificInstructions || 'None'}
</integration_instructions>

<documentation>
${documentation || 'No documentation available'}
</documentation>

<available_credentials>
${Object.keys(credentials || {}).map(v => `context.credentials.${v}`).join(", ")}
</available_credentials>

<available_input_data_fields>
${Object.keys(inputData || {}).map(v => `context.inputData.${v}`).join(", ")}
</available_input_data_fields>

<example_input_data_values>
${payloadString}
</example_input_data_values>`;

        messages.push({
            role: "system",
            content: SELF_HEALING_CODE_CONFIG_AGENT_PROMPT
        });
        messages.push({
            role: "user",
            content: userPrompt
        });
    }

    const codeConfigSchema = zodToJsonSchema(z.object({
        instruction: z.string().optional().describe("Human-readable description of what this code does"),
        code: z.string().describe(`JavaScript function that returns request config. Format: (context) => ({ url, method, headers, data, params })

The function receives context with:
- context.inputData: merged object containing payload fields AND previous step results
- context.credentials: scoped credentials for this integration only
- context.paginationState: pagination state (if configured)

Must return: { url: string, method: string, headers?: object, data?: any, params?: object }
- url supports: https://, http://, postgres://, postgresql://, ftp://, ftps://, sftp://
- For Postgres: data = { query: string, params: any[] }
- For FTP/SFTP: data = { operation: string, path: string, content?: string, ... }`),
        pagination: z.object({
            type: z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED"]),
            pageSize: z.string(),
            handler: z.string().describe(`Pagination control handler. Format: (response, pageInfo) => ({ hasMore: boolean, cursor?: any })

The handler receives:
- response: { data: any, headers: any } - Full API response with direct field access (e.g., response.data.results or response.results)
- pageInfo: { page: number, offset: number, cursor: any, totalFetched: number, limit: string, pageSize: string }

Must return:
- hasMore: boolean - Continue pagination?
- cursor?: any - Next cursor (for cursor-based pagination only)

The responses will be automatically merged using smart merge logic (arrays concatenated, objects joined, conflicts resolved by taking most recent).

Examples:
1. Check has_more flag with cursor:
   (response, pageInfo) => ({ hasMore: response.data.has_more, cursor: response.data.next_token })

2. Stop at max items:
   (response, pageInfo) => ({ hasMore: response.data.items?.length === parseInt(pageInfo.pageSize) && pageInfo.totalFetched < 10000 })

3. Stop when array is smaller than page size:
   (response, pageInfo) => ({ hasMore: (response.results || []).length >= parseInt(pageInfo.pageSize) })

4. Use API pagination flag:
   (response, pageInfo) => ({ hasMore: !!response.pagination?.next_page })`)
        }).optional().describe("Optional pagination configuration with unified handler for all pagination logic.")
    }));

    const temperature = Math.min((context.retryCount || 0) * 0.1, 1);
    const { response: generatedConfig, messages: updatedMessages } = await LanguageModel.generateObject(
        messages,
        codeConfigSchema,
        temperature
    );

    if (!generatedConfig?.code) {
        return {
            success: false,
            error: 'Failed to generate code configuration'
        };
    }

    return {
        success: true,
        data: {
            instruction: generatedConfig.instruction || codeConfig?.instruction,
            code: generatedConfig.code,
            pagination: generatedConfig.pagination || codeConfig?.pagination
        }
    };
};

export function sanitizeInstructionSuggestions(raw: unknown): string[] {
  let arr: string[] = [];

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

  arr = arr.flatMap((item) =>
    typeof item === "string" ? item.split(/\r?\n/).map((s) => s.trim()) : []
  );

  const headerRegex = /^(\s*[#>*-]+\s*)?((integration suggestions|individual suggestions|example output|example:|output:)[^a-zA-Z0-9]*|[\-*#_]{2,}|\s*)$/i;

  const isSeparator = (line: string) => {
    const trimmed = line.trim();
    return (
      /^[\s\-_*>#]+$/.test(trimmed) ||
      ["_", "-", "*", ">", "#"].includes(trimmed)
    );
  };

  const seen = new Set<string>();
  const filtered = arr
    .map((s) =>
      s
        .replace(/^[-*#>\s]+/, "")
        .replace(/[-*#>\s]+$/, "")
        .replace(/^"|"$/g, "")
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


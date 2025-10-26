import type { ApiConfig, CodeConfig } from "@superglue/client";
import { Message } from "@superglue/shared";
import { AxiosResponse } from "axios";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getObjectContext } from "../context/context-builders.js";
import { SELF_HEALING_CODE_CONFIG_AGENT_PROMPT, VALIDATE_GENERATED_CONFIG_PROMPT } from "../context/context-prompts.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { LanguageModel } from "../llm/language-model.js";
import { parseJSON } from "../utils/json-parser.js";
import { composeUrl } from "../utils/tools.js";
import { createGetValueTool } from "../utils/transform.js";
import { BaseToolContext, ToolDefinition, ToolImplementation } from "./tools.js";

export interface ConfigGenerationContext extends BaseToolContext {
    currentConfig: CodeConfig | ApiConfig,
    inputData: Record<string, any>,
    credentials: Record<string, any>,
    retryCount?: number,
    messages?: Message[],
    integrationManager: IntegrationManager,
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

    const codeConfig = context.currentConfig as any;
    const messages = context.messages as Message[];

    if (messages.length === 0) {
        const fullDocs = await integrationManager?.getDocumentation();
        const instruction = codeConfig?.stepInstruction || codeConfig?.instruction || 'Execute API call';
        const documentation = fullDocs?.content?.length < LanguageModel.contextLength / 4 ?
          fullDocs?.content :
          await integrationManager?.searchDocumentation(instruction);  
        
        let inputString = getObjectContext(inputData, { include: { schema: true, preview: true, samples: false }, characterBudget: LanguageModel.contextLength / 10 });

        const integration = await integrationManager?.getIntegration();
        const baseUrl = integration ? composeUrl(integration.urlHost, integration.urlPath) : '';

        const userPrompt = `Generate code configuration for the following:

<instruction>
${instruction}
</instruction>

<user_provided_information>
${baseUrl ? `Base URL: ${baseUrl}` : ''}
${codeConfig?.code ? `Previous code attempt:\n${codeConfig.code}` : ''}
${codeConfig?.pagination ? `Pagination config: ${JSON.stringify(codeConfig.pagination, null, 2)}` : ''}
${codeConfig.headers ? `Headers: ${JSON.stringify(codeConfig.headers)}` : ""}
${codeConfig.queryParams ? `Query Params: ${JSON.stringify(codeConfig.queryParams)}` : ""}
${codeConfig.body ? `Body: ${JSON.stringify(codeConfig.body)}` : ''}
${codeConfig.authentication ? `Authentication: ${codeConfig.authentication}` : ''}
${codeConfig.dataPath ? `Data Path: ${codeConfig.dataPath}` : ''}
${codeConfig.pagination ? `Pagination: ${JSON.stringify(codeConfig.pagination)}` : ''}
${codeConfig.method ? `Method: ${codeConfig.method}` : ''}
</user_provided_information>

<integration_instructions>  
${integration?.specificInstructions || 'None'}
</integration_instructions>

<available_credentials>
${Object.keys(credentials || {}).map(v => `context.credentials.${v}`).join(", ")}
</available_credentials>

<example_input_data_values>
${inputString}
</example_input_data_values>

<documentation>
${documentation || 'No documentation available'}
</documentation>`;

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
            handler: z.string().describe(`Pagination control handler. Format: (response, pageInfo) => ({ hasMore: boolean, resultSize: number, cursor?: any })
            
The handler receives:
- response: object with { data, headers } where data contains the COMPLETE API response body
  * Access API response via response.data (e.g., if API returns { items: [...] }, access as response.data.items)
  * If API returns nested like { data: { items: [...] } }, access as response.data.data.items
  * Use the actual structure shown in the example response data, don't assume/guess paths
- pageInfo: { page, offset, cursor, totalFetched }
  - totalFetched: total items accumulated so far (from previous pages)

Must return:
- hasMore: boolean - Continue pagination?
- resultSize: number - Number of items in THIS page (used to increment offset and totalFetched)
- cursor?: any - Next cursor (for cursor-based pagination only)

Responses are automatically merged: arrays concatenated, objects joined, conflicts resolved by taking most recent.

CRITICAL: Match the response structure to what you see in the actual API documentation/response. 
If you see { items: [...] } in docs, use response.data.items
If you see { data: { items: [...] } } in docs, use response.data.data.items
If you see { results: { edges: { nodes: [...] } } } in docs, use response.data.results.edges.nodes

Examples based on different API response structures:

1. API returns { items: [...], has_more: true }:
   (response, pageInfo) => ({ 
     hasMore: response.data.has_more,
     resultSize: (response.data.items || []).length 
   })

2. API returns { data: { items: [...], hasMore: true } }:
   (response, pageInfo) => ({ 
     hasMore: response.data.data.hasMore,
     resultSize: (response.data.data.items || []).length
   })

3. API returns { results: [...], next_cursor: "abc" }:
   (response, pageInfo) => ({ 
     hasMore: !!response.data.next_cursor,
     resultSize: (response.data.results || []).length,
     cursor: response.data.next_cursor
   })

4. API returns array directly [...]:
   (response, pageInfo) => ({ 
     hasMore: response.data.length >= 100 && pageInfo.totalFetched < 5000,
     resultSize: response.data.length
   })

5. GraphQL style { data: { issues: { nodes: [...], pageInfo: { hasNextPage, endCursor } } } }:
   (response, pageInfo) => ({ 
     hasMore: !!response.data.data.issues.pageInfo.hasNextPage,
     resultSize: (response.data.data.issues.nodes || []).length,
     cursor: response.data.data.issues.pageInfo.endCursor
   })`)
        }).optional().describe("Optional pagination configuration with unified handler for all pagination logic.")
    }));

    const temperature = Math.min((context.retryCount || 0) * 0.1, 0.8);
    const { response: generatedConfig, messages: updatedMessages } = await LanguageModel.generateObject(
        messages,
        codeConfigSchema,
        temperature
    );

    if (!generatedConfig?.code) {
        return {
            success: false,
            error: 'Failed to generate code configuration: ' + JSON.stringify(generatedConfig),
            data: {
                updatedMessages: updatedMessages
            }
        };
    }

    return {
        success: true,
        data: {
            config: {
                stepInstruction: codeConfig?.stepInstruction,
                code: generatedConfig.code,
                pagination: generatedConfig.pagination
            },
            updatedMessages: updatedMessages
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

export const validateConfigWithAgent = async (context: {
  currentConfig: CodeConfig | ApiConfig,
  inputData: any,
  credentials: any,
  response: Partial<AxiosResponse>,
  executionError?: string | null,
  integrationManager: IntegrationManager,
  messages: Message[],
  runId: string,
  orgId: string
}): Promise<{ validated: boolean; reason?: string; correctedConfig?: { code: string; pagination?: any } }> => {
  const { response, executionError, inputData, currentConfig, messages, credentials, integrationManager } = context;
  
  const getValueTool = createGetValueTool({response});
  
  const instruction = (currentConfig as any).stepInstruction || (currentConfig as any).instruction || 'Execute API call';
  const codeConfig = currentConfig as CodeConfig;
  
  const integration = await integrationManager?.getIntegration();
  const baseUrl = integration ? composeUrl(integration.urlHost, integration.urlPath) : '';
  
  const validationPrompt = `Your config was executed. Validate the result:

<your_generated_config>
Code: ${codeConfig.code || 'N/A'}
${codeConfig.pagination ? `Pagination: ${JSON.stringify(codeConfig.pagination, null, 2)}` : 'No pagination configured'}
</your_generated_config>

${executionError ? `<execution_error>
${executionError}
</execution_error>` : `<actual_api_response>
${getObjectContext(response?.data, { include: { schema: true, preview: true, samples: true }, characterBudget: 10000 })}
</actual_api_response>`}

<request_sent>
${JSON.stringify(response?.request, null, 2)}
</request_sent>

<instruction>
${instruction}
</instruction>

<integration_context>
Base URL: ${baseUrl}
Available credentials: ${Object.keys(credentials || {}).map(v => `context.credentials.${v}`).join(", ")}
</integration_context>

${VALIDATE_GENERATED_CONFIG_PROMPT}`;

  const validationSchema = {
    type: "object",
    properties: {
      validated: { type: "boolean", description: "True if config is correct, false if corrections needed" },
      reason: { type: "string", description: "Explanation of validation result or what was corrected" },
    },
    required: ["validated"]
  };
  
  const validationMessages = [...messages, { role: "user", content: validationPrompt }];
  const { response: validationResponse } = await LanguageModel.generateObject(validationMessages, validationSchema, 0, [getValueTool]);
  
  return validationResponse;
};


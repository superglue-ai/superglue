import { ApiConfig } from "@superglue/client";
import { LLMMessage } from "../llm/language-model.js";
import { LanguageModel } from "../llm/language-model.js";
import { getWebSearchTool, searchDocumentationToolDefinition } from "../utils/workflow-tools.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const stepConfigSchema = zodToJsonSchema(z.object({
    apiConfig: z.object({
      urlHost: z.string().describe("The base URL host (e.g., https://api.example.com). Must not be empty."),
      urlPath: z.string().describe("The API endpoint path (e.g., /v1/users)."),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"] as [string, ...string[]]).describe("HTTP method: GET, POST, PUT, DELETE, or PATCH"),
      queryParams: z.array(z.object({
        key: z.string(),
        value: z.string()
      })).optional().describe("Query parameters as key-value pairs. If pagination is configured, ensure you have included the right pagination parameters here or in the body."),
      headers: z.array(z.object({
        key: z.string(),
        value: z.string()
      })).optional().describe("HTTP headers as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions"),
      body: z.string().optional().describe("Request body. Use <<variable>> syntax for dynamic values. If pagination is configured, ensure you have included the right pagination parameters here or in the queryParams."),
      pagination: z.object({
        type: z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED"]),
        pageSize: z.string().describe("Number of items per page (e.g., '50', '100'). Once set, this becomes available as <<limit>> (same as pageSize)."),
        cursorPath: z.string().describe("If cursor_based: The JSONPath to the cursor in the response. If not, set this to \"\""),
        stopCondition: z.string().describe("REQUIRED: JavaScript function that determines when to stop pagination. This is the primary control for pagination. Format: (response, pageInfo) => boolean. The pageInfo object contains: page (number), offset (number), cursor (any), totalFetched (number). response is the axios response object, access response data via response.data. Return true to STOP. E.g. (response, pageInfo) => !response.data.pagination.has_more")
      }).optional().describe("OPTIONAL: Only configure if you are using pagination variables in the URL, headers, or body. For OFFSET_BASED, ALWAYS use <<offset>>. If PAGE_BASED, ALWAYS use <<page>>. If CURSOR_BASED, ALWAYS use <<cursor>>.")
    }).describe("Complete API configuration to execute")
  }));

export interface GenerateStepConfigResult {
    success: boolean;
    error?: string;
    config?: ApiConfig;
    messages?: LLMMessage[];
}

export async function generateStepConfig(retryCount: number, messages: LLMMessage[]): Promise<GenerateStepConfigResult> {
    const temperature = Math.min(retryCount * 0.1, 1);
    const webSearchTool = getWebSearchTool();
    const tools = webSearchTool 
        ? [searchDocumentationToolDefinition, { web_search: webSearchTool }]
        : [searchDocumentationToolDefinition];

    const { response: generatedConfig, error, messages: updatedMessages } = await LanguageModel.generateObject({
        messages,
        schema: stepConfigSchema,
        temperature,
        tools
    });
    
    if (error) {
        return { success: false, error, messages: updatedMessages };
    }

    if (typeof generatedConfig === 'string') {
        return { success: false, error: generatedConfig, messages: updatedMessages };
    }
    
    if (generatedConfig?.error) {
        return { success: false, error: generatedConfig.error, messages: updatedMessages };
    }
    
    if (!generatedConfig?.apiConfig) {
        return { 
            error: `LLM did not return apiConfig. Response: ${JSON.stringify(generatedConfig).slice(0, 10000)}`,
            success: false,
            messages: updatedMessages
        };
    }
    
    const config: ApiConfig = {
        id: generatedConfig.apiConfig.id || crypto.randomUUID(),
        instruction: generatedConfig.apiConfig.instruction,
        urlHost: generatedConfig.apiConfig.urlHost,
        urlPath: generatedConfig.apiConfig.urlPath,
        method: generatedConfig.apiConfig.method,
        queryParams: generatedConfig.apiConfig.queryParams ?
            Object.fromEntries(generatedConfig.apiConfig.queryParams.map((p: any) => [p.key, p.value])) :
            undefined,
        headers: generatedConfig.apiConfig.headers ?
            Object.fromEntries(generatedConfig.apiConfig.headers.map((p: any) => [p.key, p.value])) :
            undefined,
        body: generatedConfig.apiConfig.body,
        authentication: generatedConfig.apiConfig.authentication,
        pagination: generatedConfig.apiConfig.pagination,
    };
    
    return {
        success: true,
        config,
        messages: updatedMessages
    };
};
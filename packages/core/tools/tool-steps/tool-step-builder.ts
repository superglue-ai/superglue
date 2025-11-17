import { ApiConfig, HttpMethod, Integration, Pagination } from "@superglue/client";
import { LLMMessage, LLMToolWithContext } from "../../llm/llm-base-model.js";
import { LanguageModel } from "../../llm/llm-base-model.js";
import { getWebSearchTool, searchDocumentationToolDefinition } from "../../llm/llm-tools.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

type GenerateStepConfigInput = {
    retryCount: number;
    messages: LLMMessage[];
    integration: Integration;
}

export interface GenerateStepConfigResult {
    success: boolean;
    error?: string;
    config?: Partial<ApiConfig>;
    messages?: LLMMessage[];
}

const stepConfigSchema = z.object({
    stepConfig: z.object({
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
  });

export async function generateStepConfig({ retryCount, messages, integration }: GenerateStepConfigInput): Promise<GenerateStepConfigResult> {
    const temperature = Math.min(retryCount * 0.1, 1);
    const webSearchTool = getWebSearchTool();
    const tools: LLMToolWithContext[] = [{toolDefinition: searchDocumentationToolDefinition, toolContext: { integration }}];
    
    if (webSearchTool) {
        tools.push({ 
            toolDefinition: { web_search: webSearchTool },
            toolContext: {}
        });
    }

    const generateStepConfigResult = await LanguageModel.generateObject<z.infer<typeof stepConfigSchema>>({
        messages,
        schema: zodToJsonSchema(stepConfigSchema),
        temperature,
        tools
    });

    
    if (!generateStepConfigResult.success) {
        return {
            success: false,
            error: generateStepConfigResult.response as string,
            messages: generateStepConfigResult.messages
        };
    }

    const generatedConfig = generateStepConfigResult.response.stepConfig;
    
    const config: Partial<ApiConfig> = {
        urlHost: generatedConfig.urlHost,
        urlPath: generatedConfig.urlPath,
        method: generatedConfig.method as HttpMethod,
        queryParams: generatedConfig.queryParams ?
            Object.fromEntries(generatedConfig.queryParams.map((p: any) => [p.key, p.value])) :
            undefined,
        headers: generatedConfig.headers ?
            Object.fromEntries(generatedConfig.headers.map((p: any) => [p.key, p.value])) :
            undefined,
        body: generatedConfig.body,
        pagination: generatedConfig.pagination as Pagination,
    };
    
    return {
        success: true,
        config,
        messages: generateStepConfigResult.messages
    };
};
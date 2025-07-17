import { ApiConfig, AuthType, FileType, HttpMethod, PaginationType } from "@superglue/client";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LanguageModel, ToolDefinition } from "../llm/llm.js";
import { MODIFY_STEP_CONFIG_TOOL_PROMPT } from "../llm/prompts.js";
import { ToolImplementation } from "../tools/tools.js";
import { parseFile } from "../utils/file.js";
import { logMessage } from "../utils/logs.js";
import { callPostgres } from "../utils/postgres.js";
import { callAxios, composeUrl, generateId, replaceVariables } from "../utils/tools.js";

// Tool definition for executing a workflow step (replaces callEndpoint)
export const executeWorkflowStepDefinition: ToolDefinition = {
    name: "execute_workflow_step",
    description: "Execute an API endpoint with pagination support. Handles variable replacement, authentication, and data extraction. Returns the response data.",
    parameters: {
        type: "object",
        properties: {
            endpoint: {
                type: "object",
                description: "API endpoint configuration",
                properties: {
                    urlHost: { type: "string", description: "Base URL host (e.g., 'https://api.example.com')" },
                    urlPath: { type: "string", description: "API endpoint path (e.g., '/users')" },
                    method: {
                        type: "string",
                        enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
                        description: "HTTP method"
                    },
                    headers: {
                        type: "object",
                        description: "Request headers with variable placeholders using <<variableName>>",
                        properties: {},
                        additionalProperties: true
                    },
                    queryParams: {
                        type: "object",
                        description: "Query parameters with variable placeholders",
                        properties: {},
                        additionalProperties: true
                    },
                    body: {
                        type: "string",
                        description: "Request body as string (JSON) with variable placeholders"
                    },
                    dataPath: {
                        type: "string",
                        description: "Path to extract data from response (e.g., 'data.items')"
                    },
                    pagination: {
                        type: "object",
                        description: "Pagination configuration",
                        properties: {
                            type: {
                                type: "string",
                                enum: ["NONE", "PAGE_BASED", "OFFSET_BASED", "CURSOR_BASED"]
                            },
                            pageSize: { type: "string", description: "Number of items per page" },
                            cursorPath: { type: "string", description: "Path to cursor in response for cursor-based pagination" }
                        }
                    }
                },
                required: ["urlHost", "urlPath", "method"],
                additionalProperties: true
            },
            payload: {
                type: "object",
                description: "Placeholder for payload data. Always pass { placeholder: true } - actual runtime data will be injected automatically.",
                properties: {},
                additionalProperties: true
            },
            credentials: {
                type: "object",
                description: "Placeholder for credentials. Always pass { placeholder: true } - actual credentials will be injected securely.",
                properties: {},
                additionalProperties: true
            },
            options: {
                type: "object",
                description: "Request options",
                properties: {
                    timeout: { type: "number", description: "Request timeout in milliseconds" }
                }
            }
        },
        required: ["endpoint", "payload", "credentials"]
    }
};

// Helper function to convert Basic Auth to Base64
function convertBasicAuthToBase64(headerValue: string) {
    if (!headerValue) return headerValue;
    const credentials = headerValue.substring('Basic '.length).trim();
    const seemsEncoded = /^[A-Za-z0-9+/=]+$/.test(credentials);

    if (!seemsEncoded) {
        const base64Credentials = Buffer.from(credentials).toString('base64');
        return `Basic ${base64Credentials}`;
    }
    return headerValue;
}

// Implementation for executing a workflow step (contains logic from callEndpoint)
export const executeWorkflowStepImplementation: ToolImplementation = async (args, metadata) => {
    logMessage('debug', `execute_workflow_step tool called`, metadata);
    const { endpoint, payload, credentials, options = {} } = args;

    try {
        // Handle PostgreSQL endpoints differently
        if (endpoint.urlHost.startsWith("postgres")) {
            const data = await callPostgres(endpoint, payload, credentials, options);
            return { success: true, data };
        }

        const allVariables = { ...payload, ...credentials };
        let allResults = [];
        let page = 1;
        let offset = 0;
        let cursor = null;
        let hasMore = true;
        let loopCounter = 0;
        let seenResponseHashes = new Set<string>();

        while (hasMore && loopCounter < 500) {
            // Generate pagination variables
            let paginationVars = {
                page,
                offset,
                cursor,
                limit: endpoint.pagination?.pageSize || "50",
                pageSize: endpoint.pagination?.pageSize || "50"
            };

            // Combine all variables
            const requestVars = { ...paginationVars, ...allVariables };

            // Generate request parameters with variables replaced
            const headers = Object.fromEntries(
                (await Promise.all(
                    Object.entries(endpoint.headers || {})
                        .map(async ([key, value]) => [key, await replaceVariables(String(value), requestVars)])
                )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
            );

            // Process headers for Auth
            const processedHeaders: Record<string, any> = {};
            for (const [key, value] of Object.entries(headers)) {
                let processedValue = value;
                // Remove duplicate auth prefixes
                if (key.toLowerCase() === 'authorization' && typeof value === 'string') {
                    processedValue = value.replace(/^(Basic|Bearer)\s+(Basic|Bearer)\s+/, '$1 $2');
                }
                // Convert Basic Auth to Base64
                if (key.toLowerCase() === 'authorization' && typeof processedValue === 'string' && processedValue.startsWith('Basic ')) {
                    processedValue = convertBasicAuthToBase64(processedValue);
                }
                processedHeaders[key] = processedValue;
            }

            const queryParams = Object.fromEntries(
                (await Promise.all(
                    Object.entries(endpoint.queryParams || {})
                        .map(async ([key, value]) => [key, await replaceVariables(String(value), requestVars)])
                )).filter(([_, value]) => value && value !== "undefined" && value !== "null")
            );

            const body = endpoint.body ?
                await replaceVariables(endpoint.body, requestVars) :
                "";

            const url = await replaceVariables(composeUrl(endpoint.urlHost, endpoint.urlPath), requestVars);

            const axiosConfig = {
                method: endpoint.method,
                url: url,
                headers: processedHeaders,
                data: body,
                params: queryParams,
                timeout: options?.timeout || 60000,
            };

            const response = await callAxios(axiosConfig, options);

            // Check for error responses
            if (![200, 201, 202, 203, 204, 205].includes(response?.status) ||
                response.data?.error ||
                (Array.isArray(response?.data?.errors) && response?.data?.errors.length > 0)
            ) {
                const error = JSON.stringify(response?.data?.error || response.data?.errors || response?.data || response?.statusText || "undefined");
                let message = `${endpoint.method} ${url} failed with status ${response.status}.
Response: ${String(error).slice(0, 1000)}
config: ${JSON.stringify(axiosConfig)}`;

                // Add specific context for rate limit errors
                if (response.status === 429) {
                    const retryAfter = response.headers['retry-after']
                        ? `Retry-After: ${response.headers['retry-after']}`
                        : 'No Retry-After header provided';
                    message = `Rate limit exceeded. ${retryAfter}. Maximum wait time of 60s exceeded. \n\n${message}`;
                }

                throw new Error(`API call failed with status ${response.status}. Response: ${message}`);
            }

            // Check for HTML responses when expecting JSON
            if (typeof response.data === 'string' &&
                (response.data.slice(0, 100).trim().toLowerCase().startsWith('<!doctype html') ||
                    response.data.slice(0, 100).trim().toLowerCase().startsWith('<html'))) {
                throw new Error(`Received HTML response instead of expected JSON data from ${url}. 
This usually indicates an error page or invalid endpoint.\nResponse: ${response.data.slice(0, 2000)}`);
            }

            let responseData = response.data;

            // Parse file if response is string
            if (responseData && typeof responseData === 'string') {
                responseData = await parseFile(Buffer.from(responseData), FileType.AUTO);
            }

            // Extract data using dataPath if specified
            if (endpoint.dataPath) {
                const pathParts = endpoint.dataPath.split('.');
                for (const part of pathParts) {
                    if (!responseData[part] && part !== '$') {
                        break;
                    }
                    responseData = responseData[part] || responseData;
                }
            }

            // Handle pagination
            if (Array.isArray(responseData)) {
                const pageSize = parseInt(endpoint.pagination?.pageSize || "50");
                if (!pageSize || responseData.length < pageSize) {
                    hasMore = false;
                }
                const currentResponseHash = JSON.stringify(responseData);
                if (!seenResponseHashes.has(currentResponseHash)) {
                    seenResponseHashes.add(currentResponseHash);
                    allResults = allResults.concat(responseData);
                } else {
                    hasMore = false;
                }
            } else if (responseData && allResults.length === 0) {
                allResults.push(responseData);
                hasMore = false;
            } else {
                hasMore = false;
            }

            // Update pagination variables
            if (endpoint.pagination?.type === PaginationType.PAGE_BASED) {
                page++;
            } else if (endpoint.pagination?.type === PaginationType.OFFSET_BASED) {
                offset += parseInt(endpoint.pagination?.pageSize || "50");
            } else if (endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
                const cursorParts = (endpoint.pagination?.cursorPath || 'next_cursor').split('.');
                let nextCursor = response.data;
                for (const part of cursorParts) {
                    nextCursor = nextCursor?.[part];
                }
                cursor = nextCursor;
                if (!cursor) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
            loopCounter++;
        }

        // Format response based on pagination type
        if (endpoint.pagination?.type === PaginationType.CURSOR_BASED) {
            return {
                success: true,
                data: {
                    next_cursor: cursor,
                    ...(Array.isArray(allResults) ? { results: allResults } : allResults)
                }
            };
        }

        return {
            success: true,
            data: allResults?.length === 1 ? allResults[0] : allResults
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage('error', `API call failed: ${errorMessage}`, metadata);

        return {
            success: false,
            error: errorMessage,
            context: {
                url: `${endpoint.urlHost}${endpoint.urlPath}`,
                method: endpoint.method,
                hasCredentials: Object.keys(credentials || {}).length > 0
            }
        };
    }
};

export const modifyStepConfigDefinition: ToolDefinition = {
    name: "modify_step_config",
    description: "Generate or modify API configuration based on instruction, documentation, and available variables. Uses LLM to create proper API call configuration.",
    parameters: {
        type: "object",
        properties: {
            apiConfig: {
                type: "object",
                description: "Current API configuration that needs to be modified based on the error",
                properties: {
                    instruction: { type: "string", description: "Human-readable description of what this API call should do" },
                    urlHost: { type: "string", description: "Base URL host" },
                    urlPath: { type: "string", description: "API endpoint path" },
                    method: {
                        type: "string",
                        enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
                        description: "HTTP method"
                    },
                    headers: {
                        type: "object",
                        description: "Request headers",
                        properties: {},
                        additionalProperties: true
                    },
                    queryParams: {
                        type: "object",
                        description: "Query parameters",
                        properties: {},
                        additionalProperties: true
                    },
                    body: { type: "string", description: "Request body template" },
                    authentication: {
                        type: "string",
                        enum: ["NONE", "API_KEY", "BEARER_TOKEN", "BASIC_AUTH", "OAUTH2"],
                        description: "Authentication type"
                    },
                    dataPath: { type: "string", description: "Path to extract data from response" },
                    pagination: {
                        type: "object",
                        description: "Pagination configuration",
                        properties: {
                            type: {
                                type: "string",
                                enum: ["NONE", "PAGE_BASED", "OFFSET_BASED", "CURSOR_BASED"]
                            },
                            pageSize: { type: "string" },
                            cursorPath: { type: "string" }
                        }
                    },
                    responseSchema: {
                        type: "object",
                        description: "Expected response schema",
                        properties: {},
                        additionalProperties: true
                    },
                    responseMapping: { type: "string", description: "JSONata mapping for response" },
                    documentationUrl: { type: "string", description: "URL to API documentation" },
                    id: { type: "string", description: "Unique identifier for this config" },
                    createdAt: { type: "string", description: "Creation timestamp" },
                    updatedAt: { type: "string", description: "Last update timestamp" }
                },
                required: ["instruction"],
                additionalProperties: true
            },
            documentation: {
                type: "string",
                description: "API documentation to help generate the configuration"
            },
            payload: {
                type: "object",
                description: "Example payload data for understanding available variables. ALWAYS pass this even if empty ({}).",
                properties: {},
                additionalProperties: true
            },
            credentials: {
                type: "object",
                description: "Available credentials for variable references. ALWAYS pass this even if empty ({}).",
                properties: {},
                additionalProperties: true
            },
            previousAttempts: {
                type: "array",
                description: "List of all previous configuration attempts and their errors. Each attempt should include the config that was tried and the error it produced.",
                items: {
                    type: "object",
                    properties: {
                        config: {
                            type: "object",
                            description: "The API configuration that was attempted",
                            additionalProperties: true
                        },
                        error: {
                            type: "string",
                            description: "The error message that resulted from this configuration"
                        },
                        statusCode: {
                            type: "number",
                            description: "HTTP status code if available"
                        }
                    },
                    required: ["config", "error"]
                }
            },
            additionalContext: {
                type: "string",
                description: "Additional context that might help fix the configuration. This could include: relevant search results from documentation, specific error patterns you've identified, authentication examples, or any other insights gathered from previous tool calls. Extract and provide only the most relevant information."
            }
        },
        required: ["apiConfig", "payload", "credentials", "previousAttempts"]
    }
};


export const modifyStepConfigImplementation: ToolImplementation = async (args, metadata) => {
    logMessage('debug', `modify_step_config tool called`, metadata);
    const {
        apiConfig,
        documentation = "",
        payload = {},
        credentials = {},
        previousAttempts = [],
        additionalContext = ""
    } = args;

    try {
        // Define the schema for LLM to generate API config
        const schema = zodToJsonSchema(z.object({
            urlHost: z.string(),
            urlPath: z.string(),
            queryParams: z.array(z.object({
                key: z.string(),
                value: z.string()
            })).optional(),
            method: z.enum(Object.values(HttpMethod) as [string, ...string[]]),
            headers: z.array(z.object({
                key: z.string(),
                value: z.string()
            })).optional().describe("Headers to use in the API call. Use <<>> to access variables. Handle Basic Auth and Bearer Auth correctly."),
            body: z.string().optional().describe("Format as JSON if not instructed otherwise. Use <<>> to access variables."),
            authentication: z.enum(Object.values(AuthType) as [string, ...string[]]),
            dataPath: z.string().optional().describe("The path to the data you want to extract from the response. E.g. products.variants.size"),
            pagination: z.object({
                type: z.enum(Object.values(PaginationType) as [string, ...string[]]),
                pageSize: z.string().describe("Number of items per page. Set this to a number. Once you set it here as a number, you can access it using <<limit>> in headers, params, body, or url path."),
                cursorPath: z.string().describe("If cursor_based: The path to the cursor in the response. E.g. cursor.current or next_cursor. If pagination is not cursor_based, set this to \"\"")
            }).optional()
        }));

        // Build list of available variables
        const availableVariables = [
            ...Object.keys(credentials || {}),
            ...Object.keys(payload || {}),
        ].map(v => `<<${v}>>`).join(", ");

        // Prepare messages for LLM
        const messages: ChatCompletionMessageParam[] = [];

        messages.push({
            role: "system",
            content: MODIFY_STEP_CONFIG_TOOL_PROMPT
        });

        // Build context from previous attempts
        let attemptHistory = "";
        if (previousAttempts.length > 0) {
            attemptHistory = "\n\nPREVIOUS ATTEMPTS AND THEIR ERRORS:\n";
            previousAttempts.forEach((attempt, index) => {
                attemptHistory += `\nAttempt ${index + 1}:\n`;
                attemptHistory += `Configuration tried:\n${JSON.stringify(attempt.config, null, 2)}\n`;
                attemptHistory += `Error: ${attempt.error}`;
                if (attempt.statusCode) {
                    attemptHistory += ` (Status: ${attempt.statusCode})`;
                }
                attemptHistory += "\n";
            });
            attemptHistory += "\nPlease learn from these errors and generate a corrected configuration.\n";
        }

        // Build the user prompt
        const userPrompt = `Generate API configuration for the following:

Instructions: ${apiConfig.instruction}

Base URL: ${composeUrl(apiConfig.urlHost, apiConfig.urlPath)}
${attemptHistory}
${Object.values(apiConfig).filter(Boolean).length > 0 ? "Current configuration (modify as needed): " : ""}
${apiConfig.headers ? `Headers: ${JSON.stringify(apiConfig.headers)}` : ""}
${apiConfig.queryParams ? `Query Params: ${JSON.stringify(apiConfig.queryParams)}` : ""}
${apiConfig.body ? `Body: ${JSON.stringify(apiConfig.body)}` : ''}
${apiConfig.authentication ? `Authentication: ${apiConfig.authentication}` : ''}
${apiConfig.dataPath ? `Data Path: ${apiConfig.dataPath}` : ''}
${apiConfig.pagination ? `Pagination: ${JSON.stringify(apiConfig.pagination)}` : ''}
${apiConfig.method ? `Method: ${apiConfig.method}` : ''}

Available variables: ${availableVariables}
Available pagination variables (if pagination is enabled): page, pageSize, offset, cursor, limit
Example payload: ${JSON.stringify(payload || {}).slice(0, LanguageModel.contextLength / 10)}

Documentation: ${String(documentation)}
${additionalContext ? `\nAdditional Context:\n${additionalContext}` : ''}`;

        messages.push({
            role: "user",
            content: userPrompt
        });

        // Calculate temperature based on number of attempts
        const temperature = Math.min(previousAttempts.length * 0.1, 1);

        // Generate the configuration using LLM
        const { response: generatedConfig, messages: updatedMessages } = await LanguageModel.generateObject(
            messages,
            schema,
            temperature
        );

        // Build the complete API configuration
        const config: ApiConfig = {
            instruction: apiConfig.instruction,
            urlHost: generatedConfig.urlHost,
            urlPath: generatedConfig.urlPath,
            method: generatedConfig.method,
            queryParams: generatedConfig.queryParams ?
                Object.fromEntries(generatedConfig.queryParams.map((p: any) => [p.key, p.value])) :
                undefined,
            headers: generatedConfig.headers ?
                Object.fromEntries(generatedConfig.headers.map((p: any) => [p.key, p.value])) :
                undefined,
            body: generatedConfig.body,
            authentication: generatedConfig.authentication,
            pagination: generatedConfig.pagination,
            dataPath: generatedConfig.dataPath,
            documentationUrl: apiConfig.documentationUrl,
            responseSchema: apiConfig.responseSchema,
            responseMapping: apiConfig.responseMapping,
            createdAt: apiConfig.createdAt || new Date(),
            updatedAt: new Date(),
            id: apiConfig.id || generateId(generatedConfig.urlHost, generatedConfig.urlPath),
        };

        logMessage('info',
            `Generated API configuration for ${config.urlHost}${config.urlPath} (attempt ${previousAttempts.length + 1})`,
            metadata
        );

        return {
            success: true,
            config,
            messages: updatedMessages
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage('error', `Failed to generate API config: ${errorMessage}`, metadata);

        return {
            success: false,
            error: errorMessage,
            config: apiConfig,
            messages: []
        };
    }
}; 
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { ToolDefinition, ToolImplementation, WorkflowBuildContext, WorkflowExecutionContext } from "../generate/tools.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { logMessage } from "./logs.js";

export const searchDocumentationToolImplementation: ToolImplementation<WorkflowExecutionContext> = async (args, context) => {
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

        // Use DocumentationSearch for targeted search
        const documentationSearch = new DocumentationSearch({orgId: context.orgId});
        const searchResults = documentationSearch.extractRelevantSections(
            integration.documentation,
            query,
            5,
            2000,
            integration.openApiSchema
        );

        // Return the full search results
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


export const buildWorkflowImplementation: ToolImplementation<WorkflowBuildContext> = async (args, context) => {
    const { previousError } = args;
    const { messages = [] } = context;

    if (!messages || messages.length === 0) {
        return {
            success: false,
            error: "No messages provided. The build_workflow tool expects the workflow context to be provided in the message history."
        };
    }

    try {
        // Define the workflow schema
        const builtWorkflowSchema = zodToJsonSchema(z.object({
            id: z.string().describe("The workflow ID (e.g., 'stripe-create-order')"),
            steps: z.array(z.object({
                id: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails')"),
                integrationId: z.string().describe("REQUIRED: The integration ID for this step (must match one of the available integration IDs)"),
                executionMode: z.enum(["DIRECT", "LOOP"]).describe("DIRECT for single execution, LOOP for iterating over collections"),
                loopSelector: z.string().optional().describe("JavaScript function to select items to loop over. Format: (sourceData) => sourceData.items. Only required if executionMode is LOOP"),
                codeConfig: z.object({
                    instruction: z.string().optional().describe("A human-readable instruction describing what this step does (for documentation purposes)"),
                    code: z.string().describe(`JavaScript function that returns an axios request config. Format: (context) => ({ url, method, headers, data, params })
                
The context parameter contains:
- inputData: merged object containing initial payload fields AND previous step results (access via inputData.fieldName or inputData.stepId)
- credentials: scoped credentials for this integration only
- paginationState: { page, offset, cursor, limit, pageSize } - only available when pagination is configured

The function MUST return an axios config object with:
- url (string): Full URL including host and path
- method (string): HTTP method (GET, POST, PUT, DELETE, PATCH)
- headers (object, optional): HTTP headers
- data (any, optional): Request body
- params (object, optional): URL query parameters

Example without pagination:
(context) => ({
  url: 'https://api.example.com/users',
  method: 'GET',
  headers: { 'Authorization': \`Bearer \${context.credentials.api_token}\` },
  params: { id: context.inputData.userId }
})

Example with pagination:
(context) => ({
  url: 'https://api.example.com/users',
  method: 'GET', 
  headers: { 'Authorization': \`Bearer \${context.credentials.api_token}\` },
  params: { 
    limit: context.paginationState.limit,
    offset: context.paginationState.offset,
    status: context.inputData.filterStatus
  }
})

Example using previous step data:
(context) => ({
  url: \`https://api.example.com/users/\${context.inputData.fetchUserId}/profile\`,
  method: 'PATCH',
  headers: { 'Authorization': \`Bearer \${context.credentials.token}\` },
  data: {
    items: context.inputData.fetchItems.map(item => item.id)
  }
})`),
                    pagination: z.object({
                        type: z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED"]),
                        pageSize: z.string().describe("Number of items per page (e.g., '50', '100')"),
                        handler: z.string().describe("Pagination control handler. Format: (response, pageInfo) => ({ hasMore: boolean, cursor?: any }). Controls pagination flow only - responses are automatically merged. Example: (response, pageInfo) => ({ hasMore: response.data.has_more && pageInfo.totalFetched < 10000, cursor: response.data.next_cursor })")
                    }).optional().describe("OPTIONAL: Only include if pagination is needed. When configured, paginationState will be available in the code's context parameter.")
                }).describe("Code configuration that generates the axios config at runtime")
            })).describe("Array of workflow steps. Can be empty ([]) for transform-only workflows that just process the input payload without API calls"),
            finalTransform: z.string().describe("JavaScript function to transform the final workflow output to match responseSchema. Format: (sourceData) => ({ result: sourceData }). Access step results via sourceData.stepId"),
        }));

        // Add error context if this is a retry
        let finalMessages = [...messages];
        if (previousError) {
            finalMessages.push({
                role: "user",
                content: `The previous attempt failed with: "${previousError}". Please fix this issue in your new attempt.`
            } as LLMMessage);
        }

        const { response: generatedWorkflow } = await LanguageModel.generateObject(
            finalMessages,
            builtWorkflowSchema,
            0.0
        );

        try {
            const workflow = {
                ...generatedWorkflow,
                createdAt: new Date(),
                updatedAt: new Date(),
                steps: generatedWorkflow.steps.map((step: any) => ({
                    ...step,
                    responseMapping: "$" // LEGACY: Set default response mapping
                }))
            };

            logMessage('info', `Workflow built successfully: ${workflow.id}`, { orgId: context.orgId, runId: context.runId });

            return {
                success: true,
                data: workflow
            };
        } catch (workflowError) {
            const errorMsg = typeof generatedWorkflow === 'string'
                ? generatedWorkflow
                : JSON.stringify(generatedWorkflow);
            return {
                success: false,
                error: errorMsg
            };
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage('error', `Failed to build workflow: ${errorMessage}`, context);

        return {
            success: false,
            error: errorMessage
        };
    }
};

export const searchDocumentationToolDefinition: ToolDefinition = {
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

export const submitToolDefinition: ToolDefinition = {
    name: "submit_tool",
    description: "Submit an API configuration to execute the API call. The tool will make the request, validate the response against the instruction, and return success or detailed error information.",
    arguments: {
        type: "object",
        properties: {
            apiConfig: {
                type: "object",
                description: "Complete API configuration to execute",
                properties: {
                    urlHost: {
                        type: "string",
                        description: "The base URL host (e.g., https://api.example.com) or database connection string (e.g., postgres://<<user>>:<<password>>@<<hostname>>:<<port>>)"
                    },
                    urlPath: {
                        type: "string",
                        description: "The API endpoint URL path or database name for Postgres. Use <<variable>> syntax for dynamic values or JavaScript expressions."
                    },
                    method: {
                        type: "string",
                        enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
                        description: "HTTP method"
                    },
                    queryParams: {
                        type: "array",
                        description: "Query parameters as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions.",
                        items: {
                            type: "object",
                            properties: {
                                key: { type: "string" },
                                value: { type: "string" }
                            },
                            required: ["key", "value"]
                        }
                    },
                    headers: {
                        type: "array",
                        description: "HTTP headers as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions",
                        items: {
                            type: "object",
                            properties: {
                                key: { type: "string" },
                                value: { type: "string" }
                            },
                            required: ["key", "value"]
                        }
                    },
                    body: {
                        type: "string",
                        description: "Request body formatted as JSON string. Use <<variable>> syntax for dynamic values or JavaScript expressions"
                    },
                    pagination: {
                        type: "object",
                        description: "OPTIONAL: Only configure if you have verified the exact pagination mechanism from the API documentation. For OFFSET_BASED, ALWAYS use <<offset>>. If PAGE_BASED, ALWAYS use <<page>>. If CURSOR_BASED, ALWAYS use <<cursor>> in the URL, headers, or body.",
                        properties: {
                            type: {
                                type: "string",
                                enum: ["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED"],
                                description: "The type of pagination the API uses."
                            },
                            pageSize: {
                                type: "string",
                                description: "Number of items per page (e.g., '50', '100'). Once set, this becomes available as <<limit>> (same as pageSize)."
                            },
                            cursorPath: {
                                type: "string",
                                description: "If cursor_based: The path to the cursor in the response. If not, leave empty."
                            },
                            stopCondition: {
                                type: "string",
                                description: "REQUIRED: JavaScript function that determines when to stop pagination. This is the primary control for pagination. Return true to STOP."
                            }
                        }
                    }
                },
                required: ["urlHost", "urlPath", "method"]
            }
        },
        required: ["apiConfig"]
    }
};

export const buildWorkflowToolDefinition: ToolDefinition = {
    name: "build_workflow",
    description: "Build a complete executable workflow from user instructions.",
    arguments: {
        type: "object",
        properties: {},
        required: []
    },
    execute: buildWorkflowImplementation
};
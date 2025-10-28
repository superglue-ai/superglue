import { HttpMethod } from "@superglue/client";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { DocumentationSearch } from "../documentation/documentation-search.js";
import { ToolDefinition, ToolImplementation, WorkflowBuildContext, WorkflowExecutionContext } from "../execute/tools.js";
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
        const documentationSearch = new DocumentationSearch({ orgId: context.orgId });
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
                loopSelector: z.string().describe("JavaScript function that returns OBJECT for direct execution or ARRAY for loop execution. If returns OBJECT (including {}), step executes once with object as currentItem. If returns ARRAY, step executes once per array item. Examples: (sourceData) => ({ userId: sourceData.userId }) OR (sourceData) => sourceData.getContacts.data.filter(c => c.active)"),
                apiConfig: z.object({
                    id: z.string().describe("Same as the step ID"),
                    instruction: z.string().describe("A concise instruction describing WHAT data this API call should retrieve or what action it should perform."),
                    urlHost: z.string().describe("The base URL host (e.g., https://api.example.com). Must not be empty."),
                    urlPath: z.string().describe("The API endpoint path (e.g., /v1/users)."),
                    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]).describe("HTTP method: GET, POST, PUT, DELETE, or PATCH"),
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
                        cursorPath: z.string().describe("If cursor_based: The path to the cursor in the response. If not, set this to \"\""),
                        stopCondition: z.string().describe("REQUIRED: JavaScript function that determines when to stop pagination. This is the primary control for pagination. Format: (response, pageInfo) => boolean. The pageInfo object contains: page (number), offset (number), cursor (any), totalFetched (number). response is the axios response object, access response data via response.data. Return true to STOP. E.g. (response, pageInfo) => !response.data.pagination.has_more")
                    }).optional().describe("OPTIONAL: Only configure if you are using pagination variables in the URL, headers, or body. For OFFSET_BASED, ALWAYS use <<offset>>. If PAGE_BASED, ALWAYS use <<page>>. If CURSOR_BASED, ALWAYS use <<cursor>>.")
                }).describe("Complete API configuration for this step")
            })).describe("Array of workflow steps. Can be empty ([]) for transform-only workflows that just process the input payload without API calls"),
            finalTransform: z.string().describe("JavaScript function to transform the final workflow output to match responseSchema. Check if result is object or array: if object use sourceData.stepId.data, if array use sourceData.stepId.map(item => item.data). Example: (sourceData) => ({ result: Array.isArray(sourceData.stepId) ? sourceData.stepId.map(item => item.data) : sourceData.stepId.data })"),
        }));

        // Add error context if this is a retry
        let finalMessages = [...messages];
        if (previousError) {
            finalMessages.push({
                role: "user",
                content: `The previous attempt failed with: "${previousError}". Please fix this issue in your new attempt.`
            } as LLMMessage);
        }

        const { response: generatedWorkflow, error: generatedWorkflowError } = await LanguageModel.generateObject(
            finalMessages,
            builtWorkflowSchema,
            0.0
        );

        if (generatedWorkflowError || generatedWorkflow?.error) {
            throw new Error(`Error generating workflow: ${generatedWorkflowError || generatedWorkflow?.error}`);
        }

        try {
            const workflow = {
                ...generatedWorkflow,
                createdAt: new Date(),
                updatedAt: new Date(),
                steps: generatedWorkflow.steps.map((step: any) => ({
                    ...step,
                    apiConfig: {
                        ...step.apiConfig,
                        queryParams: step.apiConfig.queryParams ?
                            Object.fromEntries(step.apiConfig.queryParams.map((p: any) => [p.key, p.value])) :
                            undefined,
                        headers: step.apiConfig.headers ?
                            Object.fromEntries(step.apiConfig.headers.map((p: any) => [p.key, p.value])) :
                            undefined,
                        id: step.id,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
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
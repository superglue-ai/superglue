import { HttpMethod } from "@superglue/client";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LanguageModel } from "../llm/llm.js";
import { ToolDefinition, ToolImplementation, WorkflowBuildContext, WorkflowExecutionContext } from "../tools/tools.js";
import { callEndpoint, evaluateResponse } from "../utils/api.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";

export const searchDocumentationToolDefinition: ToolDefinition = {
    name: "search_documentation",
    description: "Search integration documentation for specific information about API structure, endpoints, authentication patterns, etc. Use this when you need to understand how an API works, what endpoints are available, or how to authenticate. Returns relevant documentation excerpts matching your search query.",
    arguments: {
        type: "object",
        properties: {
            integrationId: {
                type: "string",
                description: "ID of the integration to search"
            },
            query: {
                type: "string",
                description: "What to search for in the documentation (e.g., 'authentication', 'batch processing', 'rate limits')"
            }
        },
        required: ["integrationId", "query"]
    }
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
                        type: "object",
                        description: "Query parameters as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions.",
                        additionalProperties: { type: "string" }
                    },
                    headers: {
                        type: "object",
                        description: "HTTP headers as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions",
                        additionalProperties: { type: "string" }
                    },
                    body: {
                        type: ["string", "object"],
                        description: "Request body. Use <<variable>> syntax for dynamic values or JavaScript expressions"
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
    }
};

export const searchDocumentationToolImplementation: ToolImplementation<WorkflowExecutionContext> = async (args, context) => {
    const { integrationId, query } = args;
    logMessage('debug', `search_documentation tool called - integration: ${integrationId}, query: "${query}"`, context);
    const { integration } = context;

    if (!integration) {
        return {
            resultForAgent: {
                success: false,
                error: "Integration not provided in context. The search_documentation tool requires an integration to be passed in the tool executor context."
            },
            fullResult: {
                success: false,
                error: "Integration not provided in context. The search_documentation tool requires an integration to be passed in the tool executor context.",
                results: []
            }
        };
    }

    try {
        if (integration.id !== integrationId) {
            return {
                resultForAgent: {
                    success: false,
                    error: `Integration '${integrationId}' not found. Available integration: ${integration.id}`
                },
                fullResult: {
                    success: false,
                    error: `Integration '${integrationId}' not found. Available integration: ${integration.id}`,
                    results: []
                }
            };
        }

        if (!integration.documentation || integration.documentation.length <= 500) {
            return {
                resultForAgent: {
                    success: true,
                    data: {
                        integrationId,
                        query,
                        resultsCount: 0,
                        summary: "No documentation available for this integration. Try to execute the API call without documentation using your own knowledge. Do not use the search_documentation tool."
                    }
                },
                fullResult: {
                    success: true,
                    integrationId,
                    query,
                    resultsCount: 0,
                    results: [],
                    summary: "No documentation available for this integration"
                }
            };
        }

        // Use Documentation.extractRelevantSections for targeted search
        const searchResults = Documentation.extractRelevantSections(
            integration.documentation,
            query,
            5,
            400
        );

        // Return the full search results
        return {
            resultForAgent: {
                success: true,
                data: {
                    integrationId,
                    query,
                    resultsCount: searchResults.split('\n\n').filter(s => s.trim().length > 0).length,
                    summary: searchResults || "No matches found for your query."
                }
            },
            fullResult: {
                success: true,
                integrationId,
                query,
                resultsCount: searchResults.split('\n\n').filter(s => s.trim().length > 0).length,
                results: searchResults.split('\n\n').filter(s => s.trim().length > 0),
                summary: searchResults
            }
        };

    } catch (error) {
        return {
            resultForAgent: {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            },
            fullResult: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                results: []
            }
        };
    }
};

export const submitToolImplementation: ToolImplementation<WorkflowExecutionContext> = async (args, context) => {
    // Extract API config from args
    const { apiConfig } = args;
    const { originalEndpoint: originalEndpoint, payload, credentials, options = {}, integration } = context;

    if (!apiConfig) {
        return {
            resultForAgent: {
                success: false,
                error: "No API configuration provided. Please provide a complete API configuration in the apiConfig parameter."
            },
            fullResult: {
                success: false,
                error: "No API configuration provided"
            }
        };
    }

    logMessage('debug', `submit_tool called - ${apiConfig.method} ${apiConfig.urlHost}${apiConfig.urlPath}`, context);

    try {
        // Merge the original endpoint config with the submitted config
        const mergedConfig = {
            ...originalEndpoint,
            ...apiConfig,
            // Preserve the original instruction - don't let self-healing change the step's purpose
            instruction: originalEndpoint?.instruction || apiConfig.instruction,
            responseSchema: originalEndpoint?.responseSchema || apiConfig.responseSchema,
            id: originalEndpoint?.id || apiConfig.id,
            createdAt: originalEndpoint?.createdAt || new Date(),
            updatedAt: new Date()
        };

        const response = await callEndpoint(mergedConfig, payload, credentials, options);

        const finalData = response.data;
        const hasEvaluationCriteria = !!(mergedConfig.instruction || mergedConfig.responseSchema);

        if (hasEvaluationCriteria) {
            let documentationString = "No documentation provided";
            if (integration?.documentation) {
                documentationString = Documentation.extractRelevantSections(integration.documentation, mergedConfig.instruction + "response structure field names methods search query filter", 10, 1000);
            }

            const evalResult = await evaluateResponse(
                finalData,
                mergedConfig.responseSchema,
                mergedConfig.instruction,
                documentationString
            );

            if (!evalResult.success) {
                logMessage('warn', `Response evaluation failed: ${evalResult.shortReason}`, context);

                return {
                    resultForAgent: {
                        success: false,
                        error: evalResult.shortReason,
                        responsePreview: JSON.stringify(finalData).slice(0, 1000)
                    },
                    fullResult: {
                        success: false,
                        error: evalResult.shortReason,
                        data: finalData,
                        config: mergedConfig
                    }
                };
            }
        }

        return {
            resultForAgent: {
                success: true,
                data: {
                    message: "API call executed successfully and response matches the instruction.",
                    recordCount: Array.isArray(finalData) ? finalData.length : undefined,
                    topLevelKeys: finalData && typeof finalData === 'object' ? Object.keys(finalData).slice(0, 10) : undefined
                }
            },
            fullResult: {
                success: true,
                data: finalData,
                config: mergedConfig
            }
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage('error', `API call failed: ${errorMessage}`, context);

        return {
            resultForAgent: {
                success: false,
                error: errorMessage,
                config: apiConfig
            },
            fullResult: {
                success: false,
                error: errorMessage,
                config: apiConfig
            }
        };
    }
};

export const buildWorkflowImplementation: ToolImplementation<WorkflowBuildContext> = async (args, context) => {
    const { previousError } = args;
    const { messages = [] } = context;

    logMessage('info', `build_workflow tool called${previousError ? ' (retry)' : ''}`, context);

    if (!messages || messages.length === 0) {
        return {
            resultForAgent: {
                success: false,
                error: "No messages provided. The build_workflow tool expects the workflow context to be provided in the message history."
            },
            fullResult: {
                success: false,
                error: "No messages provided"
            }
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
                apiConfig: z.object({
                    id: z.string().describe("Same as the step ID"),
                    instruction: z.string().describe("A concise instruction describing WHAT data this API call should retrieve or what action it should perform."),
                    urlHost: z.string().describe("The base URL host (e.g., https://api.example.com)"),
                    urlPath: z.string().describe("The API endpoint path (e.g., /v1/users). Use <<variable>> syntax for dynamic values or JavaScript expressions, e.g., /users/<<currentItem_id>>/posts or /api/<<sourceData.version || 'v1'>>/data"),
                    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]).describe("HTTP method: GET, POST, PUT, DELETE, or PATCH"),
                    queryParams: z.array(z.object({
                        key: z.string(),
                        value: z.string()
                    })).optional().describe("Query parameters as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions."),
                    headers: z.array(z.object({
                        key: z.string(),
                        value: z.string()
                    })).optional().describe("HTTP headers as key-value pairs. Use <<variable>> syntax for dynamic values or JavaScript expressions"),
                    body: z.string().optional().describe("Request body. Use <<variable>> syntax for dynamic values. You can also use JavaScript expressions within <<>> tags, e.g., <<sourceData.users.map(u => u.id)>> or <<new Date().toISOString()>>"),
                    pagination: z.object({
                        type: z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED"]),
                        pageSize: z.string().describe("Number of items per page (e.g., '50', '100'). Once set, this becomes available as <<limit>> (same as pageSize)."),
                        cursorPath: z.string().describe("If cursor_based: The path to the cursor in the response. If not, set this to \"\""),
                        stopCondition: z.string().describe("REQUIRED: JavaScript function that determines when to stop pagination. This is the primary control for pagination. Format: (response, pageInfo) => boolean. The pageInfo object contains: page (number), offset (number), cursor (any), totalFetched (number). Return true to STOP.")
                    }).optional().describe("OPTIONAL: Only configure if you have verified the exact pagination mechanism from the API documentation. For OFFSET_BASED, ALWAYS use <<offset>>. If PAGE_BASED, ALWAYS use <<page>>. If CURSOR_BASED, ALWAYS use <<cursor>> in the URL, headers, or body.")
                }).describe("Complete API configuration for this step")
            })).describe("Array of workflow steps with full configuration"),
            finalTransform: z.string().describe("JavaScript function to transform the final workflow output to match responseSchema. Format: (sourceData) => ({ result: sourceData }). Access step results via sourceData.stepId"),
        }));

        // Add error context if this is a retry
        let finalMessages = [...messages];
        if (previousError) {
            finalMessages.push({
                role: "user",
                content: `The previous attempt failed with: "${previousError}". Please fix this issue in your new attempt.`
            } as ChatCompletionMessageParam);
        }

        const { response: generatedWorkflow } = await LanguageModel.generateObject(
            finalMessages,
            builtWorkflowSchema,
            0.0
        );

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

        logMessage('info', `Workflow built successfully: ${workflow.id}`, context);

        return {
            resultForAgent: {
                success: true,
                data: {
                    workflowId: workflow.id,
                    stepCount: workflow.steps.length,
                    integrations: workflow.integrationIds
                }
            },
            fullResult: {
                success: true,
                workflow
            }
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage('error', `Failed to build workflow: ${errorMessage}`, context);

        return {
            resultForAgent: {
                success: false,
                error: errorMessage
            },
            fullResult: {
                success: false,
                error: errorMessage
            }
        };
    }
};
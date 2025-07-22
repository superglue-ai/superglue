import { Integration, SelfHealingMode } from "@superglue/client";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { LanguageModel } from "../llm/llm.js";
import { ToolDefinition, ToolImplementation, WorkflowBuildContext, WorkflowExecutionContext } from "../tools/tools.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";

export const searchDocumentationToolDefinition: ToolDefinition = {
    name: "search_documentation",
    description: "Search integration documentation for specific information about API structure, endpoints, authentication patterns, etc. Use this when you need to understand how an API works, what endpoints are available, or how to authenticate. Returns relevant documentation excerpts matching your search query.",
    parameters: {
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
    parameters: {
        type: "object",
        properties: {
            apiConfig: {
                type: "object",
                description: "Complete API configuration to execute",
                properties: {
                    urlHost: {
                        type: "string",
                        description: "The base URL host (e.g., https://api.example.com)"
                    },
                    urlPath: {
                        type: "string",
                        description: "The API endpoint path (e.g., /v1/users). Use <<variable>> syntax for dynamic values"
                    },
                    method: {
                        type: "string",
                        enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
                        description: "HTTP method"
                    },
                    queryParams: {
                        type: "object",
                        description: "Query parameters as key-value pairs. Use <<variable>> syntax for dynamic values",
                        additionalProperties: { type: "string" }
                    },
                    headers: {
                        type: "object",
                        description: "HTTP headers as key-value pairs. Use <<variable>> syntax for dynamic values",
                        additionalProperties: { type: "string" }
                    },
                    body: {
                        type: "string",
                        description: "Request body. Format as JSON if not instructed otherwise. Use <<>> to access variables."
                    },
                    authentication: {
                        type: "string",
                        enum: ["NONE", "HEADER", "QUERY_PARAM", "OAUTH2"],
                        description: "Authentication type: NONE (no auth), HEADER (for Bearer/Basic/ApiKey in headers), QUERY_PARAM (for API key in URL), or OAUTH2"
                    },
                    dataPath: {
                        type: "string",
                        description: "JSONPath to extract data from response (e.g., 'data.items' or 'results[*].id')"
                    },
                    pagination: {
                        type: "object",
                        properties: {
                            type: {
                                type: "string",
                                enum: ["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED", "DISABLED"],
                                description: "The type of pagination the API uses."
                            },
                            pageSize: {
                                type: "string",
                                description: "Number of items per page (e.g., '50', '100')"
                            },
                            cursorPath: {
                                type: "string",
                                description: "If cursor_based: The path to the cursor in the response"
                            },
                            stopCondition: {
                                type: "string",
                                description: "JavaScript function that determines when to stop pagination. Format: (response, pageInfo) => boolean"
                            }
                        }
                    },
                    instruction: {
                        type: "string",
                        description: "REQUIRED: Specific instruction describing what this API call should achieve and what constitutes a successful response. Be precise about what data you expect. For exploratory calls, describe what information you're looking for (e.g., 'Get list of available contact properties' or 'Fetch contact details including all properties'). For action calls, describe the expected outcome (e.g., 'Update contact's lifecyclestage to lead and return the updated contact')."
                    }
                },
                required: ["urlHost", "urlPath", "method", "instruction"]
            }
        },
        required: ["apiConfig"]
    }
};

export const buildWorkflowToolDefinition: ToolDefinition = {
    name: "build_workflow",
    description: "Build a complete executable workflow from user instructions. All context including instruction, integrations, and payload are provided automatically.",
    parameters: {
        type: "object",
        properties: {
            previousError: {
                type: "string",
                description: "Optional: If this is a retry attempt, provide the error from the previous attempt to help fix the issue."
            }
        },
        required: []
    }
};

export const searchDocumentationToolImplementation: ToolImplementation<WorkflowExecutionContext> = async (args, context) => {
    const { integrationId, query } = args;
    logMessage('debug', `search_documentation tool called - integration: ${integrationId}, query: "${query}"`, context);
    const { integrations } = context;

    if (!integrations || !Array.isArray(integrations)) {
        return {
            resultForAgent: {
                success: false,
                error: "Integrations array not provided in context. The search_documentation tool requires integrations to be passed in the tool executor context."
            },
            fullResult: {
                success: false,
                error: "Integrations array not provided in context. The search_documentation tool requires integrations to be passed in the tool executor context.",
                results: []
            }
        };
    }

    try {
        const integration = integrations.find((i: Integration) => i.id === integrationId);

        if (!integration) {
            return {
                resultForAgent: {
                    success: false,
                    error: `Integration '${integrationId}' not found in context. Available integrations: ${integrations.map((i: Integration) => i.id).join(', ')}`
                },
                fullResult: {
                    success: false,
                    error: `Integration '${integrationId}' not found in context. Available integrations: ${integrations.map((i: Integration) => i.id).join(', ')}`,
                    results: []
                }
            };
        }

        if (!integration.documentation) {
            return {
                resultForAgent: {
                    success: true,
                    data: {
                        integrationId,
                        query,
                        resultsCount: 0,
                        summary: "No documentation available for this integration"
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

        const searchResults = Documentation.postProcess(integration.documentation, query);

        const searchTerms = query.toLowerCase().split(/[^a-z0-9]/)
            .filter(term => term.length >= 3);

        const results = [];
        const docLower = integration.documentation.toLowerCase();

        for (const term of searchTerms) {
            let index = 0;
            while ((index = docLower.indexOf(term, index)) !== -1) {
                const contextStart = Math.max(0, index - 200);
                const contextEnd = Math.min(integration.documentation.length, index + 200);
                const context = integration.documentation.slice(contextStart, contextEnd);

                results.push({
                    term,
                    context: context.trim(),
                    position: index
                });

                index += term.length;

                if (results.filter(r => r.term === term).length >= 5) break;
            }
        }

        const uniqueResults = [];
        const seenPositions = new Set();

        for (const result of results.sort((a, b) => a.position - b.position)) {
            const positionKey = Math.floor(result.position / 100);
            if (!seenPositions.has(positionKey)) {
                seenPositions.add(positionKey);
                uniqueResults.push({
                    matchedTerm: result.term,
                    context: result.context,
                    relevance: searchTerms.filter(t => result.context.toLowerCase().includes(t)).length
                });
            }
        }

        return {
            resultForAgent: {
                success: true,
                data: {
                    integrationId,
                    query,
                    resultsCount: uniqueResults.length,
                    summary: searchResults.slice(0, 2000)
                }
            },
            fullResult: {
                success: true,
                integrationId,
                query,
                resultsCount: uniqueResults.length,
                results: uniqueResults.sort((a, b) => b.relevance - a.relevance).slice(0, 10),
                summary: searchResults.slice(0, 10000)
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

export const submitToolDefinitionImplementation: ToolImplementation<WorkflowExecutionContext> = async (args, context) => {
    // Extract API config from args
    const { apiConfig } = args;
    const { endpoint: originalEndpoint, payload, credentials, options = {}, integrations } = context;
    const integration = integrations?.[0];

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

    // Validate variables before making the API call
    const availableVariables = [
        ...Object.keys(credentials || {}),
        ...Object.keys(payload || {})
    ];

    const { validateVariableReferences } = await import('../utils/tools.js');
    const validation = validateVariableReferences(apiConfig, availableVariables);

    if (!validation.valid) {
        logMessage('warn', `Variable validation failed: ${validation.message}`, context);

        const errorMessage = [
            "Configuration contains invalid variable references:",
            "",
            validation.message || "",
            "",
            `Available variables: ${availableVariables.map(v => `<<${v}>>`).join(", ")}`,
            "",
            "Fix the variable references and try again."
        ].join('\n');

        return {
            resultForAgent: {
                success: false,
                error: errorMessage,
                validationErrors: validation.errors
            },
            fullResult: {
                success: false,
                error: errorMessage,
                config: apiConfig,
                validationErrors: validation.errors
            }
        };
    }

    try {
        // Merge the original endpoint config with the submitted config
        const mergedConfig = {
            ...originalEndpoint,
            ...apiConfig,
            // Always use the step-specific instruction from apiConfig
            instruction: apiConfig.instruction,
            responseSchema: originalEndpoint?.responseSchema || apiConfig.responseSchema,
            id: originalEndpoint?.id || apiConfig.id,
            createdAt: originalEndpoint?.createdAt || new Date(),
            updatedAt: new Date()
        };

        const { callEndpoint } = await import('../utils/api.js');
        const response = await callEndpoint(mergedConfig, payload, credentials, options);

        const finalData = response.data;

        // Always evaluate the response if we have instruction or responseSchema
        if ((mergedConfig.instruction || mergedConfig.responseSchema) && (options?.testMode || !options?.selfHealing || options.selfHealing === SelfHealingMode.ENABLED || options.selfHealing === SelfHealingMode.REQUEST_ONLY)) {
            const { evaluateResponse } = await import('../utils/api.js');
            const { Documentation } = await import('../utils/documentation.js');

            let documentationString = "No documentation provided";
            if (integration?.documentation) {
                documentationString = Documentation.postProcess(integration.documentation, mergedConfig.instruction || "");
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
        const { AuthType, HttpMethod, PaginationType } = await import('@superglue/client');
        const { z } = await import('zod');
        const { zodToJsonSchema } = await import('zod-to-json-schema');

        // Define the workflow schema
        const builtWorkflowSchema = zodToJsonSchema(z.object({
            id: z.string().describe("The workflow ID (e.g., 'stripe-create-order')"),
            steps: z.array(z.object({
                id: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails')"),
                integrationId: z.string().describe("The integration ID for this step"),
                executionMode: z.enum(["DIRECT", "LOOP"]).describe("DIRECT for single execution, LOOP for iterating over collections"),
                loopSelector: z.string().optional().describe("JavaScript function to select items to loop over. Format: (sourceData) => sourceData.items. Only required if executionMode is LOOP"),
                inputMapping: z.string().optional().describe("OPTIONAL: JavaScript function to transform input data for this step. Only needed when the step requires specific data reshaping. Format: (sourceData) => ({ field1: sourceData.date, field2: sourceData.stepId.data }). Initial payload fields are at root level (sourceData.date), previous steps via stepId (sourceData.getUsers.users)"),
                apiConfig: z.object({
                    id: z.string().describe("Same as the step ID"),
                    instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve"),
                    urlHost: z.string().describe("The base URL host (e.g., https://api.example.com)"),
                    urlPath: z.string().describe("The API endpoint path (e.g., /v1/users). Use <<variable>> syntax for dynamic values"),
                    method: z.enum(Object.values(HttpMethod) as [string, ...string[]]).describe("HTTP method: GET, POST, PUT, DELETE, or PATCH"),
                    queryParams: z.array(z.object({
                        key: z.string(),
                        value: z.string()
                    })).optional().describe("Query parameters as key-value pairs. Use <<variable>> syntax for dynamic values"),
                    headers: z.array(z.object({
                        key: z.string(),
                        value: z.string()
                    })).optional(),
                    body: z.string().optional().describe("Format as JSON if not instructed otherwise. Use <<>> to access variables."),
                    authentication: z.enum(Object.values(AuthType) as [string, ...string[]]).describe("Authentication type: None, Basic, Bearer, OAuth2, or ApiKey"),
                    dataPath: z.string().optional().describe("JSONPath to extract data from response (e.g., 'data.items' or 'results[*].id')"),
                    pagination: z.object({
                        type: z.enum(["OFFSET_BASED", "PAGE_BASED", "CURSOR_BASED", "DISABLED"]),
                        pageSize: z.string().describe("Number of items per page (e.g., '50', '100'). Once set, pagination variables become available: <<page>>, <<offset>>, <<limit>> (same as pageSize), <<cursor>>. Use these variables with <<>> syntax in URL, headers, params, or body."),
                        cursorPath: z.string().describe("If cursor_based: The path to the cursor in the response. E.g. cursor.current or next_cursor. If not, set this to \"\""),
                        stopCondition: z.string().describe("REQUIRED: JavaScript function that determines when to stop pagination. This is the primary control for pagination. Format: (response, pageInfo) => boolean. Return true to STOP pagination. Common patterns: '(response) => response.data.length === 0' (empty page), '(response, pageInfo) => pageInfo.totalFetched >= 100' (limit total), '(response) => !response.has_more' (API flag)")
                    }).optional()
                }).describe("Complete API configuration for this step")
            })).describe("Array of workflow steps with full configuration"),
            finalTransform: z.string().describe("JavaScript function to transform the final workflow output to match responseSchema. Format: (sourceData) => ({ result: sourceData }). Access step results via sourceData.stepId"),
            integrationIds: z.array(z.string()).describe("List of all integration IDs used in the workflow"),
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
            0.1
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
import { ApiConfig, AuthType, HttpMethod, Integration, PaginationType } from "@superglue/client";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LanguageModel, ToolDefinition } from "../llm/llm.js";
import { MODIFY_STEP_CONFIG_TOOL_PROMPT } from "../llm/prompts.js";
import { ToolImplementation } from "../tools/tools.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";
import { composeUrl, generateId } from "../utils/tools.js";

export const searchDocumentationDefinition: ToolDefinition = {
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

export const planWorkflowDefinition: ToolDefinition = {
    name: "plan_workflow",
    description: "Creates a detailed execution plan for a workflow based on user instructions and available integrations. Use this to break down complex tasks into step-by-step API calls. The tool analyzes the instruction, reviews integration capabilities, and produces an ordered plan with specific API operations. Essential for workflow planning phase before execution.",
    parameters: {
        type: "object",
        properties: {
            messages: {
                type: "array",
                description: "The full conversation history including system prompts and user messages",
                items: {
                    type: "object",
                    properties: {
                        role: { type: "string", enum: ["system", "user", "assistant"] },
                        content: { type: "string" }
                    },
                    required: ["role", "content"]
                }
            },
            integrationIds: {
                type: "array",
                items: { type: "string" },
                description: "Array of integration IDs that should be used in the workflow"
            }
        },
        required: ["messages", "integrationIds"]
    }
};

export const buildWorkflowDefinition: ToolDefinition = {
    name: "build_workflow",
    description: "Builds a complete workflow from a plan by generating full API configurations including request bodies, headers, authentication, and transformations. Takes the output from plan_workflow and produces an executable workflow object ready for the execution phase.",
    parameters: {
        type: "object",
        properties: {
            plan: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "Workflow ID"
                    },
                    steps: {
                        type: "array",
                        description: "The sequence of steps required to fulfill the overall instruction",
                        items: {
                            type: "object",
                            properties: {
                                stepId: {
                                    type: "string",
                                    description: "Unique camelCase identifier for the step"
                                },
                                integrationId: {
                                    type: "string",
                                    description: "The ID of the integration to use for this step"
                                },
                                instruction: {
                                    type: "string",
                                    description: "A specific instruction for what this API call should achieve"
                                },
                                mode: {
                                    type: "string",
                                    enum: ["DIRECT", "LOOP"],
                                    description: "The mode of execution for this step"
                                },
                                urlHost: {
                                    type: "string",
                                    description: "Optional override for the integration's default host"
                                },
                                urlPath: {
                                    type: "string",
                                    description: "Optional specific API path for this step"
                                },
                                method: {
                                    type: "string",
                                    enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
                                    description: "HTTP method for this step"
                                }
                            },
                            required: ["stepId", "integrationId", "instruction", "mode"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["id", "steps"],
                additionalProperties: false,
                description: "The workflow plan generated by plan_workflow tool"
            },
            messages: {
                type: "array",
                description: "The full conversation history from planning phase",
                items: {
                    type: "object",
                    properties: {
                        role: { type: "string", enum: ["system", "user", "assistant"] },
                        content: { type: "string" }
                    },
                    required: ["role", "content"]
                }
            },
            instruction: {
                type: "string",
                description: "The original user instruction for the workflow"
            },
            initialPayload: {
                type: "object",
                description: "The initial payload data available to the workflow"
            },
            responseSchema: {
                type: "object",
                description: "The expected response schema for the workflow output"
            }
        },
        required: ["plan", "messages", "instruction"]
    }
};

export const executeWorkflowStepDefinition: ToolDefinition = {
    name: "execute_workflow_step",
    description: "Execute an API endpoint with pagination support. Handles variable replacement, authentication, and data extraction. Validates the response against the instruction if provided to determine if the API call was successful.",
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
                            cursorPath: { type: "string", description: "Path to cursor in response for cursor-based pagination" },
                            stopCondition: { type: "string", description: "JavaScript function: (response, pageInfo) => boolean. Return true to STOP pagination." }
                        }
                    },
                    instruction: {
                        type: "string",
                        description: "The instruction that describes what this API call should achieve. Used to validate the response."
                    },
                    responseSchema: {
                        type: "object",
                        description: "JSON Schema for the expected response structure"
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
                            cursorPath: { type: "string" },
                            stopCondition: { type: "string", description: "JavaScript function: (response, pageInfo) => boolean. Return true to STOP pagination." }
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

export const searchDocumentationImplementation: ToolImplementation = async (args, metadata) => {
    const { integrationId, query } = args;
    logMessage('debug', `search_documentation tool called - integration: ${integrationId}, query: "${query}"`, metadata);
    const { integrations } = metadata || {};

    if (!integrations || !Array.isArray(integrations)) {
        return {
            success: false,
            error: "Integrations array not provided in metadata. The search_documentation tool requires integrations to be passed in the tool executor metadata.",
            results: []
        };
    }

    try {
        const integration = integrations.find((i: Integration) => i.id === integrationId);

        if (!integration) {
            return {
                success: false,
                error: `Integration '${integrationId}' not found in metadata. Available integrations: ${integrations.map((i: Integration) => i.id).join(', ')}`,
                results: []
            };
        }

        if (!integration.documentation) {
            return {
                success: true,
                integrationId,
                query,
                resultsCount: 0,
                results: [],
                summary: "No documentation available for this integration"
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
            success: true,
            integrationId,
            query,
            resultsCount: uniqueResults.length,
            results: uniqueResults.sort((a, b) => b.relevance - a.relevance).slice(0, 10),
            summary: searchResults.slice(0, 1000)
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            results: []
        };
    }
};

export const executeWorkflowStepImplementation: ToolImplementation = async (args, metadata) => {
    const { endpoint, payload, credentials, options = {} } = args;
    logMessage('debug', `execute_workflow_step tool called - ${endpoint.method} ${endpoint.urlHost}${endpoint.urlPath}`, metadata);

    const { integrations } = metadata || {};
    const integration = integrations?.[0];

    try {
        // Use callEndpoint to execute the API call
        const { callEndpoint } = await import('../utils/api.js');
        const response = await callEndpoint(endpoint, payload, credentials, options);

        const finalData = response.data;

        // Evaluate response if instruction or responseSchema is provided
        if ((endpoint.instruction || endpoint.responseSchema) && (options?.testMode || options?.selfHealing !== false)) {
            const { evaluateResponse } = await import('../utils/api.js');
            const { Documentation } = await import('../utils/documentation.js');

            let documentationString = "No documentation provided";
            if (integration?.documentation) {
                documentationString = Documentation.postProcess(integration.documentation, endpoint.instruction || "");
            }

            const evalResult = await evaluateResponse(
                finalData,
                endpoint.responseSchema,
                endpoint.instruction,
                documentationString
            );

            if (!evalResult.success) {
                logMessage('warn', `Response evaluation failed: ${evalResult.shortReason}`, metadata);
                return {
                    success: false,
                    error: `Response evaluation failed: ${evalResult.shortReason}`,
                    data: finalData,
                    context: {
                        url: `${endpoint.urlHost}${endpoint.urlPath}`,
                        method: endpoint.method,
                        hasCredentials: Object.keys(credentials || {}).length > 0,
                        evaluationFailed: true
                    }
                };
            }
        }

        return {
            success: true,
            data: finalData
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMessage('error', `API call failed: ${errorMessage}`, metadata);
        const isPaginationError = errorMessage.includes('Pagination stop condition error');

        return {
            success: false,
            error: errorMessage,
            context: {
                url: `${endpoint.urlHost}${endpoint.urlPath}`,
                method: endpoint.method,
                hasCredentials: Object.keys(credentials || {}).length > 0,
                isPaginationError
            }
        };
    }
};

export const planWorkflowImplementation: ToolImplementation = async (args, metadata) => {
    const { messages, integrationIds } = args;
    logMessage('debug', `plan_workflow tool called`, metadata);

    const workflowPlanSchema = zodToJsonSchema(z.object({
        id: z.string().describe("Come up with an ID for the workflow e.g. 'stripe-create-order'"),
        steps: z.array(z.object({
            stepId: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails', 'updateOrderStatus')."),
            integrationId: z.string().describe("The ID of the integration (from the provided list) to use for this step."),
            instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve (e.g., 'Get user profile by email', 'Create a new order')."),
            mode: z.enum(["DIRECT", "LOOP"]).describe("The mode of execution for this step. Use 'DIRECT' for simple calls executed once or 'LOOP' when the call needs to be executed multiple times over a collection (e.g. payload is a list of customer ids and call is executed for each customer id). Important: Pagination is NOT a reason to use LOOP since pagination is handled by the execution engine itself."),
        })).describe("The sequence of steps required to fulfill the overall instruction."),
    }));

    try {
        const chatMessages: ChatCompletionMessageParam[] = messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content
        }));

        const { response: plan } = await LanguageModel.generateObject(
            chatMessages,
            workflowPlanSchema
        );

        const usedIntegrationIds = [...new Set(plan.steps.map(s => s.integrationId))];
        const invalidIds = usedIntegrationIds.filter(id => !integrationIds.includes(id));

        if (invalidIds.length > 0) {
            return {
                success: false,
                error: `Plan uses unknown integration IDs: ${invalidIds.join(', ')}. Available: ${integrationIds.join(', ')}`,
                plan: null
            };
        }

        return {
            success: true,
            plan,
            stepsCount: plan.steps.length,
            usedIntegrationIds
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            plan: null
        };
    }
};

export const buildWorkflowImplementation: ToolImplementation = async (args, metadata) => {
    const { plan, messages, instruction } = args;
    logMessage('debug', `build_workflow tool called`, metadata);

    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
        return {
            success: false,
            error: "Invalid plan structure - must have steps array",
            workflow: null
        };
    }

    try {

        const { AuthType, HttpMethod, PaginationType } = await import('@superglue/client');
        const { BUILD_WORKFLOW_SYSTEM_PROMPT } = await import('../llm/prompts.js');

        const builtWorkflowSchema = zodToJsonSchema(z.object({
            id: z.string().describe("The workflow ID from the plan"),
            steps: z.array(z.object({
                id: z.string().describe("The stepId from the plan"),
                integrationId: z.string().describe("The integration ID for this step"),
                executionMode: z.enum(["DIRECT", "LOOP"]).describe("DIRECT for single execution, LOOP for iterating over collections"),
                loopSelector: z.string().optional().describe("JavaScript function to select items to loop over. Format: (sourceData) => sourceData.items. Only required if executionMode is LOOP"),
                inputMapping: z.string().describe("JavaScript function to transform input data for this step. Format: (sourceData) => ({ ...sourceData }). Access previous step results via sourceData.stepId"),
                apiConfig: z.object({
                    id: z.string().describe("Same as the step ID"),
                    instruction: z.string().describe("The instruction from the plan for this step"),
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
                    })).optional().describe("HTTP headers as key-value pairs. Include Authorization headers here. Use <<variable>> syntax for dynamic values"),
                    body: z.string().optional().describe("Request body as a JSON string. Use <<variable>> syntax for dynamic values. Leave empty for GET requests"),
                    authentication: z.enum(Object.values(AuthType) as [string, ...string[]]).describe("Authentication type: None, Basic, Bearer, OAuth2, or ApiKey"),
                    dataPath: z.string().optional().describe("JSONPath to extract data from response (e.g., 'data.items' or 'results[*].id')"),
                    pagination: z.object({
                        type: z.enum(Object.values(PaginationType) as [string, ...string[]]),
                        pageSize: z.string().describe("Number of items per page. Set this to a number. Once you set it here as a number, you can access it using <<limit>> in headers, params, body, or url path."),
                        cursorPath: z.string().describe("If cursor_based: The path to the cursor in the response. E.g. cursor.current or next_cursor. If no"),
                        stopCondition: z.string().describe("JavaScript function that determines when to stop pagination. Format: (response, pageInfo) => boolean. Return true to STOP pagination. Examples: '(response) => response.data.length === 0', '(response, pageInfo) => pageInfo.page >= 10', '(response) => !response.next_page'")
                    }).optional()
                }).describe("Complete API configuration for this step")
            })).describe("Array of workflow steps with full configuration"),
            finalTransform: z.string().describe("JavaScript function to transform the final workflow output to match responseSchema. Format: (sourceData) => ({ result: sourceData }). Access step results via sourceData.stepId"),
            integrationIds: z.array(z.string()).describe("List of all integration IDs used in the workflow"),
        }));

        // Convert messages to proper format and add building prompt
        const chatMessages: ChatCompletionMessageParam[] = [
            { role: "system", content: BUILD_WORKFLOW_SYSTEM_PROMPT },
            ...messages.map((msg: any) => ({
                role: msg.role,
                content: msg.content
            }))
        ];

        // Generate the complete workflow in a single call
        const { response: generatedWorkflow } = await LanguageModel.generateObject(
            chatMessages,
            builtWorkflowSchema,
            0.1
        );

        const workflow = {
            ...generatedWorkflow,
            instruction,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        return {
            success: true,
            workflow,
            stepsBuilt: workflow.steps.length,
            integrationIds: workflow.integrationIds
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            workflow: null
        };
    }
};

export const modifyStepConfigImplementation: ToolImplementation = async (args, metadata) => {
    const {
        apiConfig,
        documentation = "",
        payload = {},
        credentials = {},
        previousAttempts = [],
        additionalContext = ""
    } = args;

    const debugInfo = [`modify_step_config tool called - `];
    if (previousAttempts.length > 0) {
        debugInfo.push(`attempts: ${previousAttempts.length}`);
    }
    if (additionalContext) {
        debugInfo.push(`context: "${additionalContext.slice(0, 100)}..."`);
    }
    logMessage('debug', debugInfo.join(', '), metadata);

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
                cursorPath: z.string().optional().describe("If cursor_based: The path to the cursor in the response. E.g. cursor.current or next_cursor."),
                stopCondition: z.string().describe("JavaScript function that determines when to stop pagination. Format: (response, pageInfo) => boolean. Return true to STOP pagination. Examples: '(response) => response.data.length === 0', '(response, pageInfo) => pageInfo.page >= 10', '(response) => !response.next_page'")
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
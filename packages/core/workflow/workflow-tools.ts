import { Integration } from "@superglue/client";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LanguageModel, ToolDefinition } from "../llm/llm.js";
import { ToolImplementation } from "../tools/tools.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";

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

export const searchDocumentationImplementation: ToolImplementation = async (args, metadata) => {
    const { integrationId, query } = args;
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

        logMessage('info',
            `Documentation search for '${query}' in ${integrationId} found ${uniqueResults.length} results`,
            metadata
        );

        return {
            success: true,
            integrationId,
            query,
            resultsCount: uniqueResults.length,
            results: uniqueResults.sort((a, b) => b.relevance - a.relevance).slice(0, 10),
            summary: searchResults.slice(0, 1000)
        };

    } catch (error) {
        logMessage('error',
            `Error searching documentation: ${error instanceof Error ? error.message : String(error)}`,
            metadata
        );

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            results: []
        };
    }
};

export const planWorkflowImplementation: ToolImplementation = async (args, metadata) => {
    const { messages, integrationIds } = args;

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
        logMessage('error',
            `Error planning workflow: ${error instanceof Error ? error.message : String(error)}`,
            metadata
        );

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            plan: null
        };
    }
};

export const buildWorkflowImplementation: ToolImplementation = async (args, metadata) => {
    const { plan, messages, instruction } = args;

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
                        cursorPath: z.string().describe("If cursor_based: The path to the cursor in the response. E.g. cursor.current or next_cursor.")
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
        logMessage('error',
            `Error building workflow: ${error instanceof Error ? error.message : String(error)}`,
            metadata
        );

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            workflow: null
        };
    }
}; 
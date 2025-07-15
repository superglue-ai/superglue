import { Integration } from "@superglue/client";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LanguageModel, ToolDefinition } from "../llm/llm.js";
import { PLANNING_PROMPT } from "../llm/prompts.js";
import { ToolImplementation } from "../tools/tools.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";
import { composeUrl } from "../utils/tools.js";

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
            instruction: {
                type: "string",
                description: "The user's request or task that needs to be accomplished (e.g., 'Sync all Stripe customers to HubSpot contacts')"
            },
            integrationIds: {
                type: "array",
                items: { type: "string" },
                description: "Array of integration IDs that should be used in the workflow"
            },
            initialPayload: {
                type: "object",
                description: "Any initial data/payload that will be available to the workflow (optional)",
                properties: {},
                additionalProperties: true
            }
        },
        required: ["instruction", "integrationIds"]
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
                    },
                    finalTransform: {
                        type: "string",
                        description: "JSONata expression for final output transformation"
                    }
                },
                required: ["id", "steps"],
                additionalProperties: false,
                description: "The workflow plan generated by plan_workflow tool"
            },
            responseSchema: {
                type: "object",
                description: "JSONSchema for the expected workflow output (optional)",
                properties: {},
                additionalProperties: true
            }
        },
        required: ["plan"]
    }
};

export const searchDocumentationImplementation: ToolImplementation = async (args, metadata) => {
    const { integrationId, query } = args;
    const { integrations } = metadata || {};

    if (!integrations || !Array.isArray(integrations)) {
        return {
            success: false,
            error: "No integrations provided in metadata",
            results: []
        };
    }

    const integration = integrations.find((i: Integration) => i.id === integrationId);

    if (!integration) {
        return {
            success: false,
            error: `Integration '${integrationId}' not found`,
            results: []
        };
    }

    if (!integration.documentation) {
        return {
            success: false,
            error: `No documentation available for integration '${integrationId}'`,
            results: []
        };
    }

    try {
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
    const { instruction, integrationIds, initialPayload = {} } = args;
    const { integrations } = metadata || {};

    const workflowPlanSchema = z.object({
        id: z.string().describe("Come up with an ID for the workflow e.g. 'stripe-create-order'"),
        steps: z.array(z.object({
            stepId: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails', 'updateOrderStatus')."),
            integrationId: z.string().describe("The ID of the integration (from the provided list) to use for this step."),
            instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve (e.g., 'Get user profile by email', 'Create a new order')."),
            mode: z.enum(["DIRECT", "LOOP"]).describe("The mode of execution for this step. Use 'DIRECT' for simple calls executed once or 'LOOP' when the call needs to be executed multiple times over a collection (e.g. payload is a list of customer ids and call is executed for each customer id). Important: Pagination is NOT a reason to use LOOP since pagination is handled by the execution engine itself."),
            urlHost: z.string().optional().describe("Optional. Override the integration's default host. If not provided, the integration's urlHost will be used."),
            urlPath: z.string().optional().describe("Optional. Specific API path for this step. If not provided, the integration's urlPath might be used or the LLM needs to determine it from documentation if the integration's base URL is just a host."),
            method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().describe("Tentative HTTP method for this step, e.g. GET, POST, PUT, DELETE, PATCH. If unsure, default to GET.")
        })).describe("The sequence of steps required to fulfill the overall instruction."),
        finalTransform: z.string().optional().describe("JSONata expression for final output transformation (default to '$' if no specific transformation is needed)")
    });

    if (!integrations || !Array.isArray(integrations)) {
        return {
            success: false,
            error: "No integrations provided in metadata",
            plan: null
        };
    }

    const selectedIntegrations = integrations.filter((i: Integration) =>
        integrationIds.includes(i.id)
    );

    if (selectedIntegrations.length !== integrationIds.length) {
        const missingIds = integrationIds.filter(id =>
            !selectedIntegrations.find((i: Integration) => i.id === id)
        );
        return {
            success: false,
            error: `Integration(s) not found: ${missingIds.join(', ')}`,
            plan: null
        };
    }

    try {
        const integrationDescriptions = selectedIntegrations.map((int: Integration) => {
            const processedDoc = Documentation.postProcess(int.documentation || "", instruction);
            return `
<${int.id}>
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}
  Credentials: ${Object.keys(int.credentials || {}).join(', ') || 'None'}
  ${int.specificInstructions ? `User Instructions: ${int.specificInstructions}` : ''}
  Documentation:
  \`\`\`
  ${processedDoc || 'No documentation available'}
  \`\`\`
</${int.id}>`;
        }).join("\n");

        const messages: ChatCompletionMessageParam[] = [
            { role: "system", content: PLANNING_PROMPT },
            {
                role: "user",
                content: `
Create a plan to fulfill the user's request by orchestrating API calls.

<instruction>
${instruction}
</instruction>

<available_integrations>
${integrationDescriptions}
</available_integrations>

<initial_payload>
${JSON.stringify(initialPayload, null, 2)}
</initial_payload>

Output a JSON object with the workflow plan.`
            }
        ];

        const { response: plan } = await LanguageModel.generateObject(messages, zodToJsonSchema(workflowPlanSchema));

        logMessage('info',
            `Workflow plan created: ${plan.steps.length} steps for instruction: ${instruction}`,
            metadata
        );

        return {
            success: true,
            plan,
            stepsCount: plan.steps.length,
            integrations: selectedIntegrations.map((i: Integration) => ({
                id: i.id,
                name: i.name,
                hasDocumentation: !!i.documentation
            }))
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
    const { plan, responseSchema } = args;
    const { integrations, orgId, runId } = metadata || {};

    if (!integrations || !Array.isArray(integrations)) {
        return {
            success: false,
            error: "No integrations provided in metadata",
            workflow: null
        };
    }

    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
        return {
            success: false,
            error: "Invalid plan structure - must have steps array",
            workflow: null
        };
    }

    try {
        const { generateApiConfig } = await import('../utils/api.js');
        const { toJsonSchema } = await import('../external/json-schema.js');
        const { safeHttpMethod } = await import('../utils/tools.js');
        const { Documentation } = await import('../utils/documentation.js');

        const executionSteps: any[] = [];
        const integrationMap = new Map(integrations.map((i: Integration) => [i.id, i]));

        // Collect all credentials from integrations
        const allCredentials = integrations.reduce((acc: any, int: Integration) => {
            Object.entries(int.credentials || {}).forEach(([name, value]) => {
                acc[`${int.id}_${name}`] = value;
            });
            return acc;
        }, {});

        // Build each step with full API configuration
        for (const plannedStep of plan.steps) {
            const integration = integrationMap.get(plannedStep.integrationId);

            if (!integration) {
                throw new Error(`Integration '${plannedStep.integrationId}' not found for step '${plannedStep.stepId}'`);
            }

            // Get processed documentation for this specific instruction
            const processedDoc = integration.documentation
                ? Documentation.postProcess(integration.documentation, plannedStep.instruction)
                : "";

            // Generate full API configuration using the existing generateApiConfig
            const { config: apiConfig } = await generateApiConfig(
                {
                    id: plannedStep.stepId,
                    instruction: plannedStep.instruction,
                    urlHost: plannedStep.urlHost || integration.urlHost,
                    urlPath: plannedStep.urlPath || integration.urlPath,
                    method: safeHttpMethod(plannedStep.method),
                    documentationUrl: integration.documentationUrl
                },
                processedDoc,
                {}, // payload will be determined at runtime
                allCredentials
            );

            const executionStep = {
                id: plannedStep.stepId,
                apiConfig,
                integrationId: plannedStep.integrationId,
                executionMode: plannedStep.mode,
                loopSelector: plannedStep.mode === "LOOP" ? "$" : undefined,
                inputMapping: "$",
                responseMapping: "$"
            };

            executionSteps.push(executionStep);
        }

        // Build input schema from available data
        const inputSchema = toJsonSchema(
            {
                payload: {},
                credentials: allCredentials
            },
            { arrays: { mode: 'all' } }
        );

        const workflow = {
            id: plan.id,
            steps: executionSteps,
            integrationIds: Array.from(integrationMap.keys()),
            finalTransform: plan.finalTransform || "$",
            responseSchema: responseSchema || undefined,
            inputSchema,
            instruction: metadata?.instruction || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        logMessage('info',
            `Workflow built successfully: ${workflow.id} with ${executionSteps.length} steps`,
            metadata
        );

        return {
            success: true,
            workflow,
            stepsBuilt: executionSteps.length,
            integrations: Array.from(integrationMap.values()).map((i: Integration) => ({
                id: i.id,
                name: i.name,
                credentialsUsed: Object.keys(i.credentials || {})
            }))
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
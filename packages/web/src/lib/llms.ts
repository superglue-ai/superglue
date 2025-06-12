import { SuperglueClient, Workflow, WorkflowResult } from '@superglue/client';
import { getSDKCode } from '@superglue/shared/templates';
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

export interface SystemDefinition {
    id: string;
    urlHost: string;
    urlPath?: string;
    credentials: Record<string, any>;
    documentationUrl?: string;
    documentation?: string;
}

export class SuperglueMCPClient {
    private client: SuperglueClient
    private superglueKey: string
    private openai: OpenAI

    constructor(superglueKey: string) {
        if (!process.env.GRAPHQL_ENDPOINT) {
            throw new Error('GRAPHQL_ENDPOINT is not set');
        }
        this.superglueKey = superglueKey;
        this.client = new SuperglueClient({
            endpoint: process.env.GRAPHQL_ENDPOINT,
            apiKey: superglueKey,
        });
        this.openai = new OpenAI();
    }

    // New streaming method
    async *streamLLMResponse(messages: any[]): AsyncGenerator<{
        type: 'content' | 'tool_call_start' | 'tool_call_complete' | 'tool_call_error' | 'done',
        content?: string,
        toolCall?: {
            id: string,
            name: string,
            input?: any,
            output?: any,
            error?: string
        }
    }> {
        switch (String(process.env.LLM_PROVIDER).toUpperCase()) {
            case "OPENAI":
                yield* this.streamFromOpenAI(messages);
                break;
            case "GEMINI":
                yield* this.streamFromGemini(messages);
                break;
            default:
                yield* this.streamFromOpenAI(messages);
        }
    }

    private async *streamFromOpenAI(messages: any[]): AsyncGenerator<{
        type: 'content' | 'tool_call_start' | 'tool_call_complete' | 'tool_call_error' | 'done',
        content?: string,
        toolCall?: {
            id: string,
            name: string,
            input?: any,
            output?: any,
            error?: string
        }
    }> {
        const tools = this.createTools();

        try {
            const stream = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...messages.map(msg => ({
                        role: msg.role || 'user',
                        content: msg.content || msg.text || String(msg)
                    }))
                ],
                tools: tools,
                tool_choice: "auto",
                parallel_tool_calls: true,
                stream: true,
            });

            let toolCalls: { [key: string]: { name: string, arguments: string, actualId?: string } } = {};
            let toolCallIndexMap: { [index: number]: string } = {}; // Map index to actual ID
            let hasToolCalls = false;

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;

                // Handle content streaming
                if (delta?.content) {
                    yield {
                        type: 'content',
                        content: delta.content
                    };
                }

                // Handle tool calls
                if (delta?.tool_calls) {
                    hasToolCalls = true;
                    for (const toolCall of delta.tool_calls) {
                        const index = toolCall.index || 0;
                        let toolCallId: string;

                        // If we have an actual ID, use it and map the index to it
                        if (toolCall.id) {
                            toolCallId = toolCall.id;
                            toolCallIndexMap[index] = toolCallId;
                        } else {
                            // Use the mapped ID if we have one, otherwise use index as string
                            toolCallId = toolCallIndexMap[index] || index.toString();
                        }

                        if (!toolCalls[toolCallId]) {
                            toolCalls[toolCallId] = { name: '', arguments: '', actualId: toolCall.id };
                        }

                        // Update the actual ID if we get it
                        if (toolCall.id) {
                            toolCalls[toolCallId].actualId = toolCall.id;
                        }

                        if (toolCall.function?.name) {
                            toolCalls[toolCallId].name = toolCall.function.name;
                        }

                        if (toolCall.function?.arguments) {
                            toolCalls[toolCallId].arguments += toolCall.function.arguments;
                        }
                    }
                }
            }

            // Execute tool calls if any
            if (hasToolCalls) {
                const toolResults = [];
                console.log(`Executing ${Object.keys(toolCalls).length} tool calls:`, Object.keys(toolCalls));

                for (const [toolCallId, toolCall] of Object.entries(toolCalls)) {
                    // Skip tool calls without a name or arguments
                    if (!toolCall.name || !toolCall.arguments.trim()) {
                        console.warn(`Skipping incomplete tool call ${toolCallId}: name="${toolCall.name}", args="${toolCall.arguments}"`);
                        continue;
                    }

                    try {
                        const args = JSON.parse(toolCall.arguments);

                        // Use actualId for frontend consistency, fallback to toolCallId
                        const frontendId = toolCall.actualId || toolCallId;

                        yield {
                            type: 'tool_call_start',
                            toolCall: {
                                id: frontendId,
                                name: toolCall.name,
                                input: args
                            }
                        };

                        const result = await this.executeTool(toolCall.name, args);

                        yield {
                            type: 'tool_call_complete',
                            toolCall: {
                                id: frontendId,
                                name: toolCall.name,
                                input: args,
                                output: result
                            }
                        };

                        toolResults.push({
                            tool_call_id: toolCall.actualId || toolCallId, // Use actualId for OpenAI
                            role: 'tool',
                            content: JSON.stringify(result)
                        });

                    } catch (error) {
                        console.error(`Tool execution error for ${toolCall.name}:`, error);
                        yield {
                            type: 'tool_call_error',
                            toolCall: {
                                id: toolCall.actualId || toolCallId,
                                name: toolCall.name,
                                error: error instanceof Error ? error.message : String(error)
                            }
                        };
                    }
                }

                // Only make final call if we have valid tool results
                if (toolResults.length > 0) {
                    const finalStream = await this.openai.chat.completions.create({
                        model: process.env.OPENAI_MODEL || 'gpt-4o',
                        messages: [
                            { role: 'system', content: SYSTEM_PROMPT },
                            ...messages.map(msg => ({
                                role: msg.role || 'user',
                                content: msg.content || msg.text || String(msg)
                            })),
                            {
                                role: 'assistant',
                                tool_calls: Object.entries(toolCalls)
                                    .filter(([_, call]) => call.name && call.arguments.trim())
                                    .map(([id, call]) => ({
                                        id: call.actualId || id,
                                        type: 'function' as const,
                                        function: {
                                            name: call.name,
                                            arguments: call.arguments
                                        }
                                    }))
                            },
                            ...toolResults
                        ],
                        stream: true,
                    });

                    let finalToolCalls: { [key: string]: { name: string, arguments: string, actualId?: string } } = {};
                    let finalToolCallIndexMap: { [index: number]: string } = {};
                    let hasFinalToolCalls = false;

                    for await (const chunk of finalStream) {
                        const delta = chunk.choices[0]?.delta;

                        if (delta?.content) {
                            yield {
                                type: 'content',
                                content: delta.content
                            };
                        }

                        // Handle additional tool calls in final response (sequential execution)
                        if (delta?.tool_calls) {
                            hasFinalToolCalls = true;
                            for (const toolCall of delta.tool_calls) {
                                const index = toolCall.index || 0;
                                let toolCallId: string;

                                if (toolCall.id) {
                                    toolCallId = toolCall.id;
                                    finalToolCallIndexMap[index] = toolCallId;
                                } else {
                                    toolCallId = finalToolCallIndexMap[index] || index.toString();
                                }

                                if (!finalToolCalls[toolCallId]) {
                                    finalToolCalls[toolCallId] = { name: '', arguments: '', actualId: toolCall.id };
                                }

                                if (toolCall.id) {
                                    finalToolCalls[toolCallId].actualId = toolCall.id;
                                }

                                if (toolCall.function?.name) {
                                    finalToolCalls[toolCallId].name = toolCall.function.name;
                                }

                                if (toolCall.function?.arguments) {
                                    finalToolCalls[toolCallId].arguments += toolCall.function.arguments;
                                }
                            }
                        }
                    }

                    // Execute additional tool calls if any (sequential execution)
                    if (hasFinalToolCalls) {
                        console.log(`Executing ${Object.keys(finalToolCalls).length} additional tool calls:`, Object.keys(finalToolCalls));

                        const additionalToolResults = [];

                        for (const [toolCallId, toolCall] of Object.entries(finalToolCalls)) {
                            if (!toolCall.name || !toolCall.arguments.trim()) {
                                console.warn(`Skipping incomplete additional tool call ${toolCallId}: name="${toolCall.name}", args="${toolCall.arguments}"`);
                                continue;
                            }

                            try {
                                const args = JSON.parse(toolCall.arguments);
                                const frontendId = toolCall.actualId || toolCallId;

                                yield {
                                    type: 'tool_call_start',
                                    toolCall: {
                                        id: frontendId,
                                        name: toolCall.name,
                                        input: args
                                    }
                                };

                                const result = await this.executeTool(toolCall.name, args);

                                yield {
                                    type: 'tool_call_complete',
                                    toolCall: {
                                        id: frontendId,
                                        name: toolCall.name,
                                        input: args,
                                        output: result
                                    }
                                };

                                additionalToolResults.push({
                                    tool_call_id: toolCall.actualId || toolCallId,
                                    role: 'tool',
                                    content: JSON.stringify(result)
                                });

                            } catch (error) {
                                console.error(`Additional tool execution error for ${toolCall.name}:`, error);
                                yield {
                                    type: 'tool_call_error',
                                    toolCall: {
                                        id: toolCall.actualId || toolCallId,
                                        name: toolCall.name,
                                        error: error instanceof Error ? error.message : String(error)
                                    }
                                };
                            }
                        }

                        // Make another final call if we have additional tool results
                        if (additionalToolResults.length > 0) {
                            const finalFinalStream = await this.openai.chat.completions.create({
                                model: process.env.OPENAI_MODEL || 'gpt-4o',
                                messages: [
                                    { role: 'system', content: SYSTEM_PROMPT },
                                    ...messages.map(msg => ({
                                        role: msg.role || 'user',
                                        content: msg.content || msg.text || String(msg)
                                    })),
                                    {
                                        role: 'assistant',
                                        tool_calls: Object.entries(toolCalls)
                                            .filter(([_, call]) => call.name && call.arguments.trim())
                                            .map(([id, call]) => ({
                                                id: call.actualId || id,
                                                type: 'function' as const,
                                                function: {
                                                    name: call.name,
                                                    arguments: call.arguments
                                                }
                                            }))
                                    },
                                    ...toolResults,
                                    {
                                        role: 'assistant',
                                        tool_calls: Object.entries(finalToolCalls)
                                            .filter(([_, call]) => call.name && call.arguments.trim())
                                            .map(([id, call]) => ({
                                                id: call.actualId || id,
                                                type: 'function' as const,
                                                function: {
                                                    name: call.name,
                                                    arguments: call.arguments
                                                }
                                            }))
                                    },
                                    ...additionalToolResults
                                ],
                                stream: true,
                            });

                            for await (const chunk of finalFinalStream) {
                                const delta = chunk.choices[0]?.delta;
                                if (delta?.content) {
                                    yield {
                                        type: 'content',
                                        content: delta.content
                                    };
                                }
                            }
                        }
                    }


                }
            }

            yield { type: 'done' };

        } catch (error) {
            console.error('Streaming error:', error);
            yield {
                type: 'content',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`
            };
            yield { type: 'done' };
        }
    }

    private async *streamFromGemini(messages: any[]): AsyncGenerator<{
        type: 'content' | 'tool_call_start' | 'tool_call_complete' | 'tool_call_error' | 'done',
        content?: string,
        toolCall?: any
    }> {
        yield {
            type: 'content',
            content: 'Hello, world!'
        };
        yield { type: 'done' };
    }

    private createTools() {
        return [
            {
                type: "function" as const,
                function: {
                    name: "execute_workflow",
                    description: "Execute an existing Superglue tool by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            id: {
                                type: "string",
                                description: "Tool ID to execute"
                            },
                            payload: {
                                type: "object",
                                description: "Optional payload data as key-value pairs",
                                additionalProperties: true
                            },
                            credentials: {
                                type: "object",
                                description: "Optional credentials as key-value pairs",
                                additionalProperties: true
                            }
                        },
                        required: ["id"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "build_workflow",
                    description: "Build a new Superglue tool from instructions",
                    parameters: {
                        type: "object",
                        properties: {
                            instruction: {
                                type: "string",
                                description: "Natural language instructions"
                            },
                            systems: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: {
                                            type: "string",
                                            description: "Unique identifier for the system"
                                        },
                                        urlHost: {
                                            type: "string",
                                            description: "Base URL/hostname for the API (e.g., 'api.example.com')"
                                        },
                                        urlPath: {
                                            type: "string",
                                            description: "Optional URL path prefix"
                                        },
                                        credentials: {
                                            type: "object",
                                            description: "Required credentials object with API keys/tokens as key-value pairs",
                                            additionalProperties: true
                                        },
                                        documentationUrl: {
                                            type: "string",
                                            description: "Optional URL to API documentation"
                                        },
                                        documentation: {
                                            type: "string",
                                            description: "Optional API documentation text"
                                        }
                                    },
                                    required: ["id", "urlHost", "credentials"],
                                    additionalProperties: true
                                },
                                description: "Array of system configurations. Each system must have an id, urlHost, and credentials object. Example: [{id: 'api1', urlHost: 'api.example.com', credentials: {apiKey: 'key123'}}]"
                            },
                            payload: {
                                type: "object",
                                description: "Optional payload as key-value pairs",
                                additionalProperties: true
                            },
                            responseSchema: {
                                type: "object",
                                description: "Optional response schema",
                                additionalProperties: true
                            }
                        },
                        required: ["instruction", "systems"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "generate_integration_code",
                    description: "Generate integration code for a tool",
                    parameters: {
                        type: "object",
                        properties: {
                            toolId: {
                                type: "string",
                                description: "Tool ID to generate code for"
                            },
                            language: {
                                type: "string",
                                enum: ["typescript", "python", "go"],
                                description: "Programming language"
                            }
                        },
                        required: ["toolId", "language"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "run_instruction",
                    description: "Execute one-time instructions without saving",
                    parameters: {
                        type: "object",
                        properties: {
                            instruction: {
                                type: "string",
                                description: "Natural language instructions"
                            },
                            systems: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: {
                                            type: "string",
                                            description: "Unique identifier for the system"
                                        },
                                        urlHost: {
                                            type: "string",
                                            description: "Base URL/hostname for the API (e.g., 'api.example.com')"
                                        },
                                        urlPath: {
                                            type: "string",
                                            description: "Optional URL path prefix"
                                        },
                                        credentials: {
                                            type: "object",
                                            description: "Required credentials object with API keys/tokens as key-value pairs",
                                            additionalProperties: true
                                        },
                                        documentationUrl: {
                                            type: "string",
                                            description: "Optional URL to API documentation"
                                        },
                                        documentation: {
                                            type: "string",
                                            description: "Optional API documentation text"
                                        }
                                    },
                                    required: ["id", "urlHost", "credentials"],
                                    additionalProperties: true
                                },
                                description: "Array of system configurations. Each system must have an id, urlHost, and credentials object. Example: [{id: 'api1', urlHost: 'api.example.com', credentials: {apiKey: 'key123'}}]"
                            },
                            payload: {
                                type: "object",
                                description: "Optional payload as key-value pairs",
                                additionalProperties: true
                            },
                            responseSchema: {
                                type: "object",
                                description: "Optional response schema",
                                additionalProperties: true
                            }
                        },
                        required: ["instruction", "systems"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "list_available_tools",
                    description: "List all available Superglue tools/workflows",
                    parameters: {
                        type: "object",
                        properties: {},
                        additionalProperties: false
                    }
                }
            }
        ];
    }

    private async executeTool(name: string, args: any) {
        switch (name) {
            case 'execute_workflow':
                return await this.executeWorkflow(args.id, args.payload, args.credentials);
            case 'build_workflow':
                return await this.buildWorkflow(args.instruction, args.systems, args.payload, args.responseSchema);
            case 'generate_integration_code':
                return await this.generateIntegrationCode(args.toolId, args.language);
            case 'run_instruction':
                return await this.runInstruction(args.instruction, args.systems, args.payload, args.responseSchema);
            case 'list_available_tools':
                return await this.listAvailableTools();
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    // Public methods that can be called directly for tool functionality
    async executeWorkflow(id: string, payload?: any, credentials?: any): Promise<WorkflowResult> {
        const validationErrors = this.validateToolExecution({ id, credentials });
        if (validationErrors.length > 0) {
            throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        const result = await this.client.executeWorkflow({ id, payload, credentials });
        if (result.success) {
            await this.client.upsertWorkflow(result.config.id, result.config);
        }
        return result;
    }

    async buildWorkflow(instruction: string, systems: SystemDefinition[], payload?: any, responseSchema?: any): Promise<Workflow> {
        const validationErrors = this.validateToolBuilding({ instruction, systems });
        if (validationErrors.length > 0) {
            throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        return await this.client.buildWorkflow({
            instruction,
            payload: payload || {},
            systems,
            responseSchema: responseSchema || {}
        });
    }

    async generateIntegrationCode(toolId: string, language: "typescript" | "python" | "go"): Promise<any> {
        const sdkCode = await this.generateSDKCode(toolId);
        if (!sdkCode) {
            throw new Error(`Failed to generate code for tool ${toolId}`);
        }
        if (!['typescript', 'python', 'go'].includes(language)) {
            throw new Error(`Language '${language}' is not supported. Supported languages are: typescript, python, go.`);
        }
        return {
            toolId,
            language,
            code: sdkCode[language],
        };
    }

    async runInstruction(instruction: string, systems: SystemDefinition[], payload?: any, responseSchema?: any): Promise<any> {
        const validationErrors = this.validateToolBuilding({ instruction, systems });
        if (validationErrors.length > 0) {
            throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        // Build the tool temporarily
        const workflow = await this.client.buildWorkflow({
            instruction,
            payload: payload || {},
            systems,
            responseSchema: responseSchema || {},
            save: false
        });

        const credentials = Object.values(systems as SystemDefinition[]).reduce((acc, sys) => {
            return { ...acc, ...Object.entries(sys.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${sys.id}_${name}`]: value }), {}) };
        }, {});

        // Execute it immediately
        const result = await this.client.executeWorkflow({
            workflow: workflow,
            payload,
            credentials: credentials
        });

        return {
            success: result.success,
            data: result.data,
            error: result.error,
            instruction_executed: instruction,
            note: "Tool was executed once and not saved. Use buildWorkflow if you want to save it for reuse."
        };
    }

    async listAvailableTools(): Promise<any> {
        return await this.client.listWorkflows(100);
    }

    private validateToolExecution(args: any): string[] {
        const errors: string[] = [];

        if (!args.id) {
            errors.push("Tool ID is required.");
        }

        if (args.credentials && typeof args.credentials !== 'object') {
            errors.push("Credentials must be a JSON object with key-value pairs.");
        }

        return errors;
    }

    private validateToolBuilding(args: any): string[] {
        const errors: string[] = [];

        if (!args.instruction || args.instruction.length < 10) {
            errors.push("Instruction must be detailed (minimum 10 characters). Describe what the tool should do, what systems it connects to, and expected inputs/outputs.");
        }

        if (!args.systems || !Array.isArray(args.systems) || args.systems.length === 0) {
            errors.push("Systems array is required with at least one system configuration including credentials.");
        }

        return errors;
    }

    private async generateSDKCode(toolId: string) {
        const endpoint = process.env.GRAPHQL_ENDPOINT || "https://graphql.superglue.ai";

        try {
            const tool = await this.client.getWorkflow(toolId);

            const generatePlaceholders = (schema: any) => {
                if (!schema || !schema.properties) return { payload: {}, credentials: {} };

                const payload: any = {};
                const credentials: any = {};

                if (schema.properties.payload && schema.properties.payload.properties) {
                    Object.entries(schema.properties.payload.properties).forEach(([key, prop]: [string, any]) => {
                        payload[key] = prop.type === 'string' ? `"example_${key}"` :
                            prop.type === 'number' ? 123 :
                                prop.type === 'boolean' ? true :
                                    prop.type === 'array' ? [] : {};
                    });
                }

                if (schema.properties.credentials && schema.properties.credentials.properties) {
                    Object.entries(schema.properties.credentials.properties).forEach(([key, prop]: [string, any]) => {
                        credentials[key] = prop.type === 'string' ? `"example_${key}"` :
                            prop.type === 'number' ? 123 :
                                prop.type === 'boolean' ? true :
                                    prop.type === 'array' ? [] : {};
                    });
                }

                return { payload, credentials };
            };

            const inputSchema = tool.inputSchema ?
                (typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema) :
                null;

            const { payload, credentials } = generatePlaceholders(inputSchema);

            return getSDKCode({
                apiKey: this.superglueKey,
                endpoint: endpoint,
                workflowId: toolId,
                payload,
                credentials,
            });

        } catch (error) {
            console.warn(`Failed to generate SDK code for tool ${toolId}:`, error);
            return null;
        }
    }

    async fromGemini(messages: ChatCompletionMessageParam[]): Promise<string> {
        return "Hello, world!"
    }
}

const SYSTEM_PROMPT = `You are an AI assistant with access to Superglue tools.
Superglue is a text to workflow Tool

AGENT WORKFLOW:
1. DISCOVER: Use list_available_tools to see what's available
2. EXECUTE: Use execute_workflow for existing tools or build_workflow for new workflows. Use run_instruction for one-time instructions.
3. INTEGRATE: Use generate_integration_code to show users how to implement

CAPABILITIES:
- Connect to any REST API, database, or web service
- Transform data between different formats and schemas
- Build custom tools from natural language instructions
- Generate production-ready code in TypeScript, Python, Go

BEST PRACTICES:
- Always gather ALL credentials before building tools
- Use descriptive instructions when building new tools
- Validate tool IDs exist before execution
- if the user is not explicit about building a tool vs running a one-time instruction, assume they want to run an instruction
- Provide integration code when users ask "how do I use this?"
- When multiple independent operations are requested, call multiple tools simultaneously rather than sequentially
- if a user asks you do things that require multiple tools, call them either in parallel or sequentially, depending on the situation
- Use parallel tool execution when operations don't depend on each other's results

PARALLEL EXECUTION:
- If asked to execute multiple workflows, call execute_workflow multiple times
- If asked to generate code for multiple tools, call generate_integration_code multiple times
- If asked to run multiple independent instructions, call run_instruction multiple times
- Only execute tools sequentially when one depends on the output of another

CRITICAL SEQUENTIAL PATTERNS:
- "Build a tool... then run it" → ALWAYS call build_workflow first, then execute_workflow with the created tool ID
- "Create workflow... then execute it" → ALWAYS call build_workflow first, then execute_workflow
- "Build and run..." → ALWAYS call build_workflow first, then execute_workflow
- When user asks to both create AND use a tool, always do both operations`


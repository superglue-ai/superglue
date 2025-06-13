import { Integration, SuperglueClient, Workflow, WorkflowResult } from '@superglue/client';
import { getSDKCode } from '@superglue/shared/templates';
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

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
                console.log(`Executing ${Object.keys(toolCalls).length} tool calls:`, Object.keys(toolCalls));

                for (const [toolCallId, toolCall] of Object.entries(toolCalls)) {
                    // Skip tool calls without a name or arguments
                    if (!toolCall.name || !toolCall.arguments.trim()) {
                        console.warn(`Skipping incomplete tool call ${toolCallId}: name="${toolCall.name}", args="${toolCall.arguments}"`);
                        continue;
                    }

                    yield* this.executeToolCall(toolCall.actualId || toolCallId, toolCall);
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
                            integrations: {
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
                        required: ["instruction", "integrations"],
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
                            integrations: {
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
                        required: ["instruction", "integrations"],
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
            },
            {
                type: "function" as const,
                function: {
                    name: "add_integration",
                    description: "Add or update an integration configuration",
                    parameters: {
                        type: "object",
                        properties: {
                            id: {
                                type: "string",
                                description: "Unique identifier for the integration"
                            },
                            name: {
                                type: "string",
                                description: "Display name for the integration"
                            },
                            type: {
                                type: "string",
                                description: "Type of integration (e.g., 'api', 'database', 'webhook')"
                            },
                            urlHost: {
                                type: "string",
                                description: "Base URL/hostname for the integration (e.g., 'api.example.com')"
                            },
                            urlPath: {
                                type: "string",
                                description: "Optional URL path prefix"
                            },
                            credentials: {
                                type: "object",
                                description: "Default credentials object with API keys/tokens as key-value pairs",
                                additionalProperties: true
                            },
                            documentationUrl: {
                                type: "string",
                                description: "URL to the integration's API documentation"
                            },
                            documentation: {
                                type: "string",
                                description: "API documentation text or description"
                            },
                            icon: {
                                type: "string",
                                description: "Icon identifier for the integration"
                            }
                        },
                        required: ["id", "urlHost"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "delete_integration",
                    description: "Delete an integration configuration",
                    parameters: {
                        type: "object",
                        properties: {
                            id: {
                                type: "string",
                                description: "ID of the integration to delete"
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
                    name: "list_integrations",
                    description: "List all available integrations",
                    parameters: {
                        type: "object",
                        properties: {
                            limit: {
                                type: "number",
                                description: "Maximum number of integrations to return (default: 20)"
                            },
                            offset: {
                                type: "number",
                                description: "Number of integrations to skip (default: 0)"
                            }
                        },
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
                return await this.buildWorkflow(args.instruction, args.integrations, args.payload, args.responseSchema);
            case 'generate_integration_code':
                return await this.generateIntegrationCode(args.toolId, args.language);
            case 'run_instruction':
                return await this.runInstruction(args.instruction, args.integrations, args.payload, args.responseSchema);
            case 'list_available_tools':
                return await this.listAvailableTools();
            case 'add_integration':
                return await this.addIntegration(args);
            case 'delete_integration':
                return await this.deleteIntegration(args.id);
            case 'list_integrations':
                return await this.listIntegrations(args.limit, args.offset);
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

    async buildWorkflow(instruction: string, integrations: Integration[], payload?: any, responseSchema?: any): Promise<Workflow> {
        const validationErrors = this.validateToolBuilding({ instruction, integrations });
        if (validationErrors.length > 0) {
            throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        return await this.client.buildWorkflow({
            instruction,
            payload: payload || {},
            integrations: integrations,
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

    async runInstruction(instruction: string, integrations: Integration[], payload?: any, responseSchema?: any): Promise<any> {
        const validationErrors = this.validateToolBuilding({ instruction, integrations });
        if (validationErrors.length > 0) {
            throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }

        // Build the tool temporarily
        const workflow = await this.client.buildWorkflow({
            instruction,
            payload: payload || {},
            systems: integrations,
            responseSchema: responseSchema || {},
            save: false
        } as any);

        const credentials = Object.values(integrations as Integration[]).reduce((acc, sys) => {
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

    async addIntegration(integrationData: any): Promise<any> {
        const validationErrors = this.validateIntegrationInput(integrationData);
        if (validationErrors.length > 0) {
            throw new Error(`Validation failed:\n${validationErrors.join('\n')}`);
        }
        try {
            const result = await this.client.upsertIntegration(integrationData.id, integrationData);
            return {
                success: true,
                integration: result,
                message: `Integration '${integrationData.id}' ${integrationData.name ? `(${integrationData.name})` : ''} has been successfully added/updated.`
            };
        } catch (error) {
            throw new Error(`Failed to add integration: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async deleteIntegration(id: string): Promise<any> {
        if (!id) {
            throw new Error("Integration ID is required for deletion.");
        }

        try {
            const result = await this.client.deleteIntegration(id);
            return {
                success: result,
                message: result ? `Integration '${id}' has been successfully deleted.` : `Failed to delete integration '${id}'.`
            };
        } catch (error) {
            throw new Error(`Failed to delete integration: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async listIntegrations(limit: number = 20, offset: number = 0): Promise<any> {
        try {
            const result = await this.client.listIntegrations(limit, offset);
            return {
                integrations: result.items,
                total: result.total,
                count: result.items.length,
                limit,
                offset
            };
        } catch (error) {
            throw new Error(`Failed to list integrations: ${error instanceof Error ? error.message : String(error)}`);
        }
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
            errors.push("Instruction must be detailed (minimum 10 characters). Describe what the tool should do, what integrations it connects to, and expected inputs/outputs.");
        }

        if (!args.integrations || !Array.isArray(args.integrations) || args.integrations.length === 0) {
            errors.push("Integrations array is required with at least one integration.");
        }

        return errors;
    }

    private validateIntegrationInput(args: any): string[] {
        const errors: string[] = [];

        if (!args.id || args.id.trim().length === 0) {
            errors.push("Integration ID is required and cannot be empty.");
        }

        if (!args.urlHost || args.urlHost.trim().length === 0) {
            errors.push("URL Host is required and cannot be empty.");
        }

        if (args.credentials && typeof args.credentials !== 'object') {
            errors.push("Credentials must be a JSON object with key-value pairs.");
        }

        if (args.urlHost && !args.urlHost.match(/^https?:\/\//) && !args.urlHost.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
            errors.push("URL Host must be a valid hostname or URL (e.g., 'api.example.com' or 'https://api.example.com').");
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

    private async *executeToolCall(id: string, call: { name: string, arguments: string }): AsyncGenerator<{
        type: 'tool_call_start' | 'tool_call_complete' | 'tool_call_error',
        toolCall: {
            id: string,
            name: string,
            input?: any,
            output?: any,
            error?: string
        }
    }> {
        if (!call.name || !call.arguments.trim()) {
            yield {
                type: 'tool_call_error',
                toolCall: {
                    id,
                    name: call.name || 'unknown',
                    error: `Incomplete tool call: name="${call.name}", arguments="${call.arguments}"`
                }
            };
            return;
        }

        try {
            const args = JSON.parse(call.arguments);

            yield {
                type: 'tool_call_start',
                toolCall: {
                    id,
                    name: call.name,
                    input: args
                }
            };

            const result = await this.executeTool(call.name, args);

            yield {
                type: 'tool_call_complete',
                toolCall: {
                    id,
                    name: call.name,
                    input: args,
                    output: result
                }
            };
        } catch (error) {
            console.error(`Tool execution error for ${call.name}:`, error);
            yield {
                type: 'tool_call_error',
                toolCall: {
                    id,
                    name: call.name,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
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


import { NextRequest, NextResponse } from 'next/server'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface ToolCall {
    id: string
    name: string
    input: any
    output?: any
    status: 'pending' | 'completed' | 'error'
    error?: string
}

// MCP Client for Superglue integration
class SuperglueMCPClient {
    private baseUrl: string
    private apiKey: string

    constructor(apiKey: string) {
        this.apiKey = apiKey
        this.baseUrl = process.env.SUPERGLUE_MCP_URL || 'https://api.superglue.ai/v1'
    }

    async executeTool(toolName: string, payload: any = {}, credentials: any = {}): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/tools/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    id: toolName,
                    payload,
                    credentials: {
                        ...credentials,
                        superglue_authorization: this.apiKey
                    }
                }),
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()
            return {
                success: true,
                data: result,
                isError: false
            }
        } catch (error) {
            console.error(`Failed to execute tool ${toolName}:`, error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                isError: true
            }
        }
    }

    async buildNewTool(instruction: string, systems: any[] = [], payload: any = {}): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/tools/build`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    instruction,
                    systems,
                    payload
                }),
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()
            return {
                success: true,
                data: result,
                isError: false
            }
        } catch (error) {
            console.error('Failed to build new tool:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                isError: true
            }
        }
    }

    async runInstruction(instruction: string, systems: any[] = [], payload: any = {}): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/tools/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    instruction,
                    systems,
                    payload
                }),
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()
            return {
                success: true,
                data: result,
                isError: false
            }
        } catch (error) {
            console.error('Failed to run instruction:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                isError: true
            }
        }
    }
}

const SYSTEM_PROMPT = `You are an AI assistant with access to Superglue MCP tools. You can help users with:

- API integrations and configurations
- Data transformations and extractions
- Building and testing integrations
- Analyzing data structures and schemas
- Automating workflows

You have access to various MCP tools that can interact with APIs, databases, and other systems. When users ask for help with integrations or data tasks, proactively suggest using the appropriate tools.

Be helpful, concise, and practical in your responses. Always explain what you're doing when using tools.`

// Helper function to extract and validate authentication token
function extractAndValidateToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization')

    if (!authHeader) {
        return null
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i)
    if (!tokenMatch) {
        return null
    }

    const token = tokenMatch[1].trim()

    // Validate token exists and is not empty
    if (!token) {
        return null
    }

    // In a production environment, you would validate the token against your auth system
    // For now, we'll check if it matches the expected API key from environment variables
    const expectedApiKey = process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY || process.env.AUTH_TOKEN

    if (!expectedApiKey) {
        console.error('No API key configured in environment variables')
        return null
    }

    if (token !== expectedApiKey) {
        console.error('Invalid API key provided')
        return null
    }

    return token
}

// Define available MCP tools we can use
const MCP_TOOLS = {
    'mcp_superglue_superglue_execute_tool': 'Execute a specific Superglue tool by ID',
    'mcp_superglue_superglue_build_new_tool': 'Build a new integration tool from natural language',
    'mcp_superglue_superglue_get_integration_code': 'Generate integration code for a tool',
    'mcp_superglue_superglue_run_instruction': 'Execute an instruction once without saving',
    'mcp_superglue_execute_hubspot-get-2025-closed-deals': 'Get HubSpot closed deals for 2025'
}

// Helper function to determine which MCP tools to use based on user message
function analyzeProblem(message: string): { shouldUseMCP: boolean; suggestedTools: string[]; reasoning: string } {
    const lowerMessage = message.toLowerCase()

    // Keywords that suggest MCP tool usage
    const apiKeywords = ['api', 'integration', 'connect', 'sync', 'fetch', 'get data', 'webhook']
    const buildKeywords = ['build', 'create', 'make', 'setup', 'configure']
    const executeKeywords = ['run', 'execute', 'call', 'test']
    const dataKeywords = ['hubspot', 'salesforce', 'stripe', 'database', 'postgres', 'mysql']

    const suggestedTools: string[] = []
    let reasoning = ''

    // Check for HubSpot specific requests
    if (lowerMessage.includes('hubspot') && (lowerMessage.includes('deals') || lowerMessage.includes('2025'))) {
        suggestedTools.push('mcp_superglue_execute_hubspot-get-2025-closed-deals')
        reasoning = 'User is asking about HubSpot deals, using specific HubSpot tool'
    }

    // Check for building new integrations
    else if (buildKeywords.some(kw => lowerMessage.includes(kw)) && apiKeywords.some(kw => lowerMessage.includes(kw))) {
        suggestedTools.push('mcp_superglue_superglue_build_new_tool')
        reasoning = 'User wants to build a new integration'
    }

    // Check for executing existing tools
    else if (executeKeywords.some(kw => lowerMessage.includes(kw)) && apiKeywords.some(kw => lowerMessage.includes(kw))) {
        suggestedTools.push('mcp_superglue_superglue_execute_tool')
        reasoning = 'User wants to execute an existing tool'
    }

    // Check for one-time instructions
    else if (lowerMessage.includes('once') || lowerMessage.includes('quick') || lowerMessage.includes('ad-hoc')) {
        suggestedTools.push('mcp_superglue_superglue_run_instruction')
        reasoning = 'User needs a one-time execution'
    }

    // General API/integration request
    else if (apiKeywords.some(kw => lowerMessage.includes(kw)) || dataKeywords.some(kw => lowerMessage.includes(kw))) {
        suggestedTools.push('mcp_superglue_superglue_run_instruction')
        reasoning = 'User is asking about API/data integration'
    }

    return {
        shouldUseMCP: suggestedTools.length > 0,
        suggestedTools,
        reasoning
    }
}

// Execute MCP tool using Superglue MCP client
async function executeMCPTool(toolName: string, input: any, apiKey: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const mcpClient = new SuperglueMCPClient(apiKey)

        // Route to appropriate MCP method based on tool name
        if (toolName === 'mcp_superglue_execute_hubspot-get-2025-closed-deals') {
            // Use direct tool execution for HubSpot deals
            const result = await mcpClient.executeTool('hubspot-get-2025-closed-deals', {}, {
                hubspot_authorization: process.env.HUBSPOT_API_KEY || ''
            })
            return result
        }

        if (toolName === 'mcp_superglue_superglue_build_new_tool') {
            // Use build new tool method
            const systems = extractSystemsFromInstruction(input.instruction)
            const result = await mcpClient.buildNewTool(input.instruction, systems)
            return result
        }

        if (toolName === 'mcp_superglue_superglue_run_instruction') {
            // Use run instruction method for one-time executions
            const systems = extractSystemsFromInstruction(input.instruction)
            const result = await mcpClient.runInstruction(input.instruction, systems)
            return result
        }

        if (toolName === 'mcp_superglue_superglue_execute_tool') {
            // Extract tool ID from instruction and execute
            const toolId = extractToolIdFromInstruction(input.instruction)
            if (!toolId) {
                return {
                    success: false,
                    error: 'Could not determine tool ID from instruction'
                }
            }
            const result = await mcpClient.executeTool(toolId, input)
            return result
        }

        return {
            success: false,
            error: `Tool ${toolName} not supported`
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

// Helper function to extract systems configuration from natural language instruction
function extractSystemsFromInstruction(instruction: string): any[] {
    const systems: any[] = []
    const lowerInstruction = instruction.toLowerCase()

    // Check for common API integrations
    if (lowerInstruction.includes('hubspot')) {
        systems.push({
            id: 'hubspot',
            urlHost: 'https://api.hubapi.com',
            credentials: {
                hubspot_authorization: process.env.HUBSPOT_API_KEY || ''
            }
        })
    }

    if (lowerInstruction.includes('stripe')) {
        systems.push({
            id: 'stripe',
            urlHost: 'https://api.stripe.com',
            credentials: {
                stripe_authorization: process.env.STRIPE_API_KEY || ''
            }
        })
    }

    if (lowerInstruction.includes('salesforce')) {
        systems.push({
            id: 'salesforce',
            urlHost: 'https://api.salesforce.com',
            credentials: {
                salesforce_authorization: process.env.SALESFORCE_API_KEY || ''
            }
        })
    }

    if (lowerInstruction.includes('postgres') || lowerInstruction.includes('postgresql')) {
        systems.push({
            id: 'postgres',
            urlHost: `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}`,
            urlPath: process.env.POSTGRES_DB || 'main',
            credentials: {}
        })
    }

    return systems
}

// Helper function to extract tool ID from instruction
function extractToolIdFromInstruction(instruction: string): string | null {
    // Look for patterns like "execute tool abc123" or "run hubspot-get-deals"
    const toolIdMatch = instruction.match(/(?:execute|run)\s+(?:tool\s+)?([a-z0-9-_]+)/i)
    return toolIdMatch ? toolIdMatch[1] : null
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate the request
        const apiKey = extractAndValidateToken(request)
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Unauthorized: Invalid or missing API key' },
                { status: 401 }
            )
        }

        const { messages } = await request.json() as { messages: ChatMessage[] }

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: 'Invalid messages format' },
                { status: 400 }
            )
        }

        const lastMessage = messages[messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'user') {
            return NextResponse.json(
                { error: 'Last message must be from user' },
                { status: 400 }
            )
        }

        // Analyze the user's message to determine if we should use MCP tools
        const analysis = analyzeProblem(lastMessage.content)

        let toolCalls: ToolCall[] = []
        let response: string

        // If we should use MCP tools, execute them
        if (analysis.shouldUseMCP && analysis.suggestedTools.length > 0) {
            const toolPromises = analysis.suggestedTools.map(async (toolName) => {
                const toolCall: ToolCall = {
                    id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: toolName,
                    input: { instruction: lastMessage.content },
                    status: 'pending'
                }

                // Execute the tool with authenticated API key
                const result = await executeMCPTool(toolName, { instruction: lastMessage.content }, apiKey)

                if (result.success) {
                    toolCall.status = 'completed'
                    toolCall.output = result.data
                } else {
                    toolCall.status = 'error'
                    toolCall.error = result.error
                }

                return toolCall
            })

            toolCalls = await Promise.all(toolPromises)

            // Generate response based on tool results
            const successfulTools = toolCalls.filter(t => t.status === 'completed')
            const failedTools = toolCalls.filter(t => t.status === 'error')

            if (successfulTools.length > 0) {
                response = `I've executed ${successfulTools.length} Superglue MCP tool(s) to help with your request:\n\n`

                successfulTools.forEach((tool, index) => {
                    response += `**${tool.name.replace('mcp_superglue_', '').replace(/_/g, ' ')}**\n`

                    if (tool.output) {
                        if (tool.name.includes('hubspot-get-2025-closed-deals')) {
                            response += `Found ${tool.output.count} closed deals totaling $${tool.output.totalAmount.toLocaleString()}:\n`
                            tool.output.deals.forEach((deal: any) => {
                                response += `- ${deal.name}: $${deal.amount.toLocaleString()} (${deal.closeDate})\n`
                            })
                        } else if (tool.output.result) {
                            response += `Result: ${tool.output.result}\n`
                        } else {
                            response += `✅ Tool executed successfully\n`
                        }
                    }
                    response += '\n'
                })

                if (failedTools.length > 0) {
                    response += `⚠️ ${failedTools.length} tool(s) encountered errors:\n`
                    failedTools.forEach(tool => {
                        response += `- ${tool.name}: ${tool.error}\n`
                    })
                }

                response += `\nReasoning: ${analysis.reasoning}`
            } else {
                response = `I attempted to use Superglue MCP tools but encountered errors:\n\n`
                failedTools.forEach(tool => {
                    response += `❌ ${tool.name}: ${tool.error}\n`
                })
                response += `\nLet me know if you'd like me to try a different approach!`
            }
        } else {
            // Generate regular conversation response
            const userMessage = lastMessage.content.toLowerCase()

            if (userMessage.includes('hello') || userMessage.includes('hi')) {
                response = "Hello! I'm here to help you with API integrations, data transformations, and building automations using Superglue MCP tools. What would you like to work on today?"
            } else if (userMessage.includes('help') || userMessage.includes('what can you do')) {
                response = `I'm your AI assistant powered by Superglue MCP! Here's what I can help you with:

**🔗 API Integrations**
- Connect to REST APIs, GraphQL endpoints, databases
- Configure authentication (API keys, OAuth, etc.)
- Handle pagination and rate limiting

**📊 Data Processing**
- Transform data between different formats
- Extract specific fields from responses
- Map data structures between systems

**🛠️ Available MCP Tools**
${Object.entries(MCP_TOOLS).map(([key, desc]) => `- ${key.replace('mcp_superglue_', '').replace(/_/g, ' ')}: ${desc}`).join('\n')}

**🚀 Automation**
- Create workflows that chain multiple APIs
- Schedule recurring data syncs
- Set up webhooks and notifications

Just describe what you want to build and I'll use the appropriate MCP tools to help you!`
            } else if (userMessage.includes('superglue') || userMessage.includes('mcp')) {
                response = `Superglue MCP (Model Context Protocol) gives me powerful integration capabilities! Here's what's available:

**🔧 Tool Execution**
- Execute any Superglue tool by ID with proper credentials
- Handle complex API workflows automatically
- Support for pagination, retries, and error handling

**🏗️ Dynamic Tool Building**  
- Build new integrations from natural language instructions
- Connect to any API with documentation
- Generate reusable integration tools

**📝 Code Generation**
- Generate TypeScript, Python, or Go integration code
- Include example payloads and authentication
- Ready-to-use SDK code for your applications

**🌐 System Support**
- REST APIs, GraphQL, databases (PostgreSQL, MySQL, etc.)
- Authentication: API keys, OAuth, Basic Auth
- File processing, webhooks, and more

Would you like me to show you how to use any of these capabilities? I can help you build something specific!`
            } else {
                response = `I understand you're asking about: "${lastMessage.content}"

I can help you with API integrations, data transformations, and building automations using Superglue MCP tools. To better assist you, could you provide more details about what you'd like to accomplish?

For example:
- **API Integration**: "Connect to Stripe API to get customer data"
- **Data Transformation**: "Transform JSON from API A to format for API B"  
- **Workflow Automation**: "Sync HubSpot deals to Slack daily"
- **Database Query**: "Get user analytics from PostgreSQL database"

The more specific you are, the better I can help with the right MCP tools!`
            }
        }

        return NextResponse.json({
            content: response,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            timestamp: new Date().toISOString(),
            analysis: analysis.shouldUseMCP ? analysis : undefined
        })

    } catch (error) {
        console.error('Chat API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Superglue MCP Chat API is running',
        availableTools: Object.keys(MCP_TOOLS),
        version: '1.0.0'
    })
} 
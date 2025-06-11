# Superglue Agent Interface

A ChatGPT-like AI assistant interface with native Superglue MCP (Model Context Protocol) integration for API integrations, data transformations, and workflow automation.

## Features

### 🤖 Intelligent Chat Interface
- **Modern UI**: Clean, responsive chat interface with message history
- **Typing Indicators**: Real-time typing animation and loading states
- **Tool Visualization**: Shows MCP tool executions with status badges
- **Message Formatting**: Syntax highlighting and proper text formatting
- **Auto-scroll**: Automatically scrolls to latest messages

### 🔧 Superglue MCP Integration
- **Smart Tool Selection**: Automatically detects when to use MCP tools based on user input
- **Real-time Execution**: Execute Superglue tools directly from chat
- **Error Handling**: Comprehensive error handling with helpful suggestions
- **Multiple Tool Support**: Can execute multiple tools simultaneously

### 🛠️ Available MCP Tools
- **`superglue_execute_tool`**: Execute existing Superglue tools by ID
- **`superglue_build_new_tool`**: Build new integrations from natural language
- **`superglue_get_integration_code`**: Generate TypeScript/Python/Go code
- **`superglue_run_instruction`**: Execute one-time instructions without saving
- **`execute_hubspot-get-2025-closed-deals`**: Example HubSpot integration

## Usage Examples

### API Integration Requests
```
"Connect to Stripe API to get customer data"
"Build integration to sync HubSpot deals to Slack"
"Get HubSpot closed deals for 2025"
```

### Data Transformation
```
"Transform JSON from API A to format for API B"
"Query PostgreSQL database for user analytics"
"Extract customer data from Salesforce"
```

### Code Generation
```
"Generate TypeScript code for my integration"
"Show me Python code to call this API"
"Create Go integration for my workflow"
```

## Technical Architecture

### Frontend Components
- **`AgentInterface.tsx`**: Main chat interface component
- **Message Management**: State management for chat history
- **Tool Execution**: Real-time tool status tracking
- **UI Components**: Built with shadcn/ui for consistency

### Backend API
- **`/api/agent/chat`**: Chat endpoint with MCP integration
- **Tool Analysis**: Smart detection of required MCP tools
- **Error Handling**: Comprehensive error messages and suggestions
- **Response Formatting**: Structured responses with tool results

### MCP Integration
- **Tool Detection**: Keyword-based analysis for tool selection
- **Parallel Execution**: Multiple tools can run simultaneously
- **Result Processing**: Formats tool outputs for user display
- **Error Recovery**: Graceful handling of tool failures

## File Structure

```
packages/web/src/
├── components/agent/
│   └── AgentInterface.tsx          # Main chat interface
├── app/
│   ├── agent/
│   │   └── page.tsx               # Agent page route
│   ├── api/agent/chat/
│   │   └── route.ts               # Chat API endpoint
│   └── page.tsx                   # Updated homepage
└── components/
    └── Sidebar.tsx                # Updated navigation
```

## Getting Started

1. **Navigate to Agent**: Visit `/agent` or click "AI Assistant" in the sidebar
2. **Start Chatting**: Type your integration or automation request
3. **Watch Tools Execute**: See MCP tools run in real-time
4. **Get Results**: Receive structured responses with data and code

## Example Interactions

### Building a New Integration
**User**: "Build an integration to get Stripe customers and sync them to HubSpot"

**Assistant**: 
- Detects this needs `superglue_build_new_tool`
- Executes the tool with your instruction
- Returns the created tool ID and next steps

### Executing Existing Tools
**User**: "Get HubSpot closed deals for 2025"

**Assistant**:
- Detects this matches the HubSpot deals tool
- Executes `execute_hubspot-get-2025-closed-deals`
- Returns formatted deal data with totals

### Generating Code
**User**: "Generate TypeScript code for my integration"

**Assistant**:
- Uses `superglue_get_integration_code`
- Returns production-ready TypeScript code
- Includes example payloads and authentication

## Customization Points

### Adding New MCP Tools
1. Add tool to `MCP_TOOLS` object in `/api/agent/chat/route.ts`
2. Update `analyzeProblem()` function for detection keywords
3. Implement tool execution in `executeMCPTool()` function

### Modifying UI
1. Update `AgentInterface.tsx` for interface changes
2. Modify message rendering in `renderMessage()` function
3. Customize styling with Tailwind classes

### Enhancing Analysis
1. Update keyword detection in `analyzeProblem()`
2. Add new reasoning patterns
3. Implement more sophisticated NLP for intent detection

## Production Considerations

### Real MCP Integration
The current implementation simulates MCP tool responses. For production:

1. **Replace Simulation**: Update `executeMCPTool()` to call real MCP functions
2. **Add Authentication**: Implement proper credential management
3. **Error Handling**: Add more robust error handling and retry logic
4. **Rate Limiting**: Implement rate limiting for API calls

### Performance Optimization
1. **Streaming**: Implement real streaming responses
2. **Caching**: Cache frequently used tool results
3. **Lazy Loading**: Implement message pagination for large histories
4. **Debouncing**: Add input debouncing for better UX

### Security
1. **Input Validation**: Validate and sanitize user inputs
2. **Credential Security**: Secure credential storage and transmission
3. **Rate Limiting**: Prevent abuse with proper rate limiting
4. **CORS**: Configure proper CORS policies

## Next Steps

1. **Real LLM Integration**: Connect to OpenAI, Anthropic, or other LLM providers
2. **Advanced MCP**: Implement all Superglue MCP capabilities
3. **User Authentication**: Add user accounts and session management
4. **Tool Marketplace**: Allow users to share and discover tools
5. **Advanced Analytics**: Track usage patterns and optimize performance

## Support

For questions about the agent interface or Superglue MCP integration, refer to:
- [Superglue Documentation](https://docs.superglue.cloud)
- [MCP Documentation](https://docs.superglue.cloud/mcp)
- [API Reference](https://docs.superglue.cloud/api) 
---
title: "Intro to MCP"
description: "Instant reliable tools for your agents"
---

Turn any API into tools so your agents can get things done reliably.

**superglue MCP** provides a general tool that lets agents build reliable, validated tools for any app, database or API, simply by requesting them in natural language.

## How superglue MCP Works

superglue MCP is a lightweight API-wrapper available via MCP that:

1. **Merges multiple endpoints and APIs into custom tools** 
2. **Exposes them via one server** that abstracts away endpoints and API calls
3. **Acts like a repository pattern** that stays stable even as upstream APIs or mappings change

### Key Benefits

- **Merge Multiple APIs**: Combine endpoints and APIs into custom capabilities. No more juggling dozens of specific tools - create unified capabilities that work across multiple services.
- **Production Ready**: Secure, fast, and guaranteed to work. Built for production deployments with stability guarantees even as upstream APIs change.
- **Bespoke Agent Tools**: Custom tools that agents actually need. Stop building generic tools - create purpose-built capabilities that match your specific workflows and business logic.

## Use superglue MCP to:

**Stitch Stripe and HubSpot together**: Build reliable cross-API workflows like fetching transactions in Stripe and updating them in HubSpot reliably.

**Create Ambient Agents**: Build agents that react to app triggers and events. Create agents that monitor your systems and respond automatically to events, triggers and webhooks.

**Wrap your own APIs**: Make your own APIs accessible by any agent. Turn your internal APIs and services into agent-friendly capabilities with built-in validation and error handling.

## Connecting to the MCP Server

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp.mp4" />

The superglue MCP server is available at the `/mcp` endpoint of your superglue instance.

- **Hosted Endpoint**: `https://mcp.superglue.ai/`
- **Self-Hosted Endpoint**: `http://<your-superglue-host>:<port>/mcp` (e.g., `http://localhost:3000/mcp`)

```Connection String for Cursor / Windsurf / Claude Code (requires mcp-remote)
{
	"mcpServers": {
	  "superglue": {
			"command": "npx",
			"args": [
				"mcp-remote",
				"https://mcp.superglue.ai",
				"--header",
				"Authorization:${AUTH_HEADER}"
			],
			"env": {
				"AUTH_HEADER": "Bearer YOUR_SUPERGLUE_API_KEY"
			}	
	    }
	}
}
```

The reason this request is structured in an odd way (AUTH_HEADER instead of AUTH_TOKEN) is because Cursor does not allow spaces within the args array, but does so for env vars. This might become obsolete in future versions.

## Using superglueMCP Tools

Switch to the agent mode of your LLM interface and prompt to build or execute a superglue tool. All superglue tools are exposed through MCP. For the video example to work, you need to share your HubSpot API key when running the tool.

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp-short.mp4" />

### Authentication

All requests to the MCP server must be authenticated. superglue's MCP integration uses a key-based authentication system just like the GQL endpoint, see [quickstart](/quickstart).

### Session Management

MCP interactions are session-based. A session allows the server to maintain context across multiple requests from the same client.

- **Establishing a Session**:
  - To start a new session, the client sends an MCP `initialize` request to the `/mcp` endpoint (typically via a POST request).
  - The server responds with a `sessionId` (e.g., in a header or the response body, though MCP standard usually involves the server generating it and the client then using it). The superglue implementation generates a UUID for the session.
- **Maintaining a Session**:
  - For subsequent requests within the same session, the client must include the `mcp-session-id` header with the value of the `sessionId` received during initialization.
  - `POST /mcp`: Used for most MCP requests like `listTools` and `callTool`.
  - `GET /mcp` & `DELETE /mcp`: The `handleMcpSessionRequest` in `mcp-server.ts` suggests these might be used for session-specific operations, requiring the `mcp-session-id` header. For example, to check session status or explicitly close a session if implemented.

<Tip>
  You can find an overview of all superglue MCP tools [here](/docs/mcp/mcp-tools).
</Tip>
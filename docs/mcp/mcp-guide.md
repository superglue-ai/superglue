---
title: "Building an MCP workflow"
description: "A quick guide on using superglue MCP to build integrations."
---

In this guide, we will cover how to use superglue MCP to build custom HubSpot integration workflows in Cursor. Integrating with HubSpot often involves fetching related data, like companies and their contacts, and transforming it into a specific structure for your application. superglue MCP can automate these multi-step processes, enabling the creation of complex, multi-step data aggregation workflows through natural language prompts.

This guide demonstrates how to build and run a workflow that:

1. Fetches a list of companies from HubSpot.
2. For each company, fetches its associated contacts.
3. Combines this data into a nested structure where each company object contains an array of its contacts.

You can use the superglue client SDK to do this, but in this tutorial we will cover how to build this workflow using superglue MCP.

## Prerequisites

- A HubSpot account with API access.
- A HubSpot Private App and its Access Token (recommended for authentication).
- Ensure that you have added superglue MCP to your `mcp.json`.

```json mcp.json
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

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp.mp4" />

<Note>
  Make sure to replace the API key placeholder with your own API key after copying.
</Note>

## Authentication

HubSpot's API uses Bearer token authentication. The simplest way is to create a [Private App](https://developers.hubspot.com/docs/api/private-apps) in your HubSpot developer account and use its Access Token.

Keep this token handy; you'll provide it as a credential when telling your agent to build and execute your new HubSpot integration workflow.

## Building a Custom HubSpot Workflow

You can find detailed descriptions of all available tools provided by superglue MCP [here](/docs/mcp/mcp-tools). In this tutorial, we will start off by building a custom integration workflow using natural language and your Cursor chat interface only. Using superglue MCP is as easy as providing your LLM agent of choice with a prompt containing instructions and any authentication tokens you may need:

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp-doc-demo.mp4" />

## What Happened Under the Hood:

- superglue MCP used `superglue_find_relevant_integrations` to discover available HubSpot integrations
- superglue MCP used `superglue_build_and_run` to build and test a new workflow that fetches and transforms the requested data according to the user instructions
- superglue MCP used `superglue_save_workflow` to persist the workflow for future use
- superglue MCP used `superglue_execute_workflow` to execute the saved workflow
- superglue MCP used `superglue_get_workflow_integration_code` to generate the code required to embed this workflow in an existing codebase

## Next Steps

- **Reuse Workflows**: You can re-run the workflow any time either programmatically by running the integration code generated, or through superglue MCP by asking your agent to use `superglue_execute_workflow` with the correct ID
- **Complex Scenarios**: Extend this pattern to include more HubSpot objects (Deals, Tickets), apply more complex transformations, or integrate HubSpot data with other system data by building more workflows with superglue MCP.
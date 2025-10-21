---
title: "superglue MCP Integration"
description: "Universal MCP tool for reliable agent workflows across any API"
---

Turn any API into workflows so your agents can get things done reliably.

**superglue MCP** provides a universal tool that lets agents build reliable, validated workflows for any app, database or API, simply by requesting them in natural language.

<Info>
  MCP (Model Context Protocol) is the easiest way to give AI agents access to external tools and data sources. superglue provides a universal MCP server that connects to any API.
</Info>

## What You Get with MCP

<CardGroup cols={2}>
  <Card title="One Tool, Any API" icon="universal-access">
    Instead of building separate MCP tools for each API, superglue gives your agent one powerful tool that connects to everything.
  </Card>
  <Card title="Natural Language" icon="comment">
    Your agent can describe integrations in plain English - no need to learn specific API syntax.
  </Card>
  <Card title="Built-in Reliability" icon="shield">
    Automatic retries, error handling, and rate limiting built into every API call.
  </Card>
  <Card title="Self-Healing" icon="heart">
    When APIs change, superglue adapts automatically - your agent workflows keep working.
  </Card>
</CardGroup>

## How superglue MCP Works

Instead of building separate MCP tools for each API, superglue provides one powerful MCP server that:

1. **Merges multiple endpoints and APIs into custom workflows**
2. **Exposes them via one server** that abstracts away endpoints and API calls
3. **Acts like a repository pattern** that stays stable even as upstream APIs or mappings change

### What You Can Build

<CardGroup cols={3}>
  <Card title="Cross-API Workflows" icon="workflow">
    **Stitch Stripe and HubSpot together**: Build reliable workflows like fetching transactions in Stripe and updating them in HubSpot.
  </Card>
  <Card title="Ambient Agents" icon="robot">
    **Create reactive agents**: Build agents that monitor your systems and respond automatically to events, triggers and webhooks.
  </Card>
  <Card title="Internal API Access" icon="code">
    **Wrap your own APIs**: Make your internal APIs and services accessible by any agent with built-in validation and error handling.
  </Card>
</CardGroup>

## Setup for Claude Desktop

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/mcp.mp4" />

<Steps>
  <Step title="Get Your API Key">
    Get your API key from [app.superglue.cloud](https://app.superglue.cloud) or use your self-hosted instance.
  </Step>
  <Step title="Configure Claude Desktop">
    Add to your Claude Desktop MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json`):

    ```json
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

    <Tip>
      **Self-hosting?** Replace `https://mcp.superglue.ai` with `http://<your-superglue-host>:<port>/mcp` (e.g., `http://localhost:3000/mcp`)
    </Tip>
    <Warning>
      The `AUTH_HEADER` format is used because Cursor/Claude Desktop doesn't allow spaces in the args array, but does allow them in environment variables.
    </Warning>
  </Step>
  <Step title="Restart Claude Desktop">
    Close and reopen Claude Desktop. You should see "superglue" connected in the MCP status.
  </Step>
</Steps>

## Available MCP Tools

The superglue MCP server provides two focused tools:

<AccordionGroup>
  <Accordion title="superglue_find_relevant_tools" icon="search">
    **Purpose:** Search for your pre-built superglue tools

    **Usage:**

    > "Find my Slack notification tools"

    **What it does:** Searches through your saved workflows and returns relevant tool IDs with their instructions and integrations.

    **Returns:** Tool metadata including ID, instruction, steps, and integrations used.
  </Accordion>
  <Accordion title="superglue_execute_tool" icon="play">
    **Purpose:** Execute a saved tool by ID

    **Usage:**

    > "Run tool send-slack-alert with payload {channel: 'alerts', message: 'Test'}"

    **What it does:** Executes the tool and returns only the result data or error message.

    **Returns:** Clean execution results - just `{success, data}` or `{success, error}`. No workflow metadata.
  </Accordion>
</AccordionGroup>

<Note>
**Building New Tools**

MCP only executes existing tools. Create new tools via:
- [superglue UI](https://app.superglue.cloud)
- [Client SDK](/agent-builders/sdk-integration) 
- Direct GraphQL API calls

Once saved, tools are automatically available through MCP.
</Note>

## Agent Framework Integration

### LangChain

You can use superglue with LangChain agents that support MCP:

```python
from langchain_community.tools import MCPTool
from langchain.agents import initialize_agent

# Initialize MCP connection to superglue
superglue_tools = MCPTool.from_server(
    server_command=["npx", "mcp-remote", "https://mcp.superglue.ai", "--header", "Authorization:Bearer YOUR_API_KEY"]
)

# Add to your agent
agent = initialize_agent(
    tools=[superglue_tools],
    llm=your_llm,
    agent_type="conversational-react-description"
)
```

### CrewAI

```python
from crewai import Agent, Task, Crew
from crewai_tools import MCPTool

# Create superglue tool
superglue = MCPTool(
    server_command=["npx", "mcp-remote", "https://mcp.superglue.ai", "--header", "Authorization:Bearer YOUR_API_KEY"]
)

# Add to your agent
data_agent = Agent(
    role="Data Integration Specialist",
    tools=[superglue],
    goal="Integrate and orchestrate data from multiple APIs"
)
```

### Cursor / Windsurf / Claude Code

For coding assistants, use the same configuration in your MCP settings:

```json
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

## Example Agent Conversations

<Tabs>
  <Tab title="Finding and Running Tools">
    **Human:** "Find my GitHub to Slack Integration tools"

    **Agent:** "Let me search for your GitHub to Slack Integration tools..."

    _[Agent uses superglue_find_relevant_tools with searchTerms: "github slack integration"]_

    "I found 1 Pokemon tool:
    - **github-pr-to-slack-channel**: Sends a notification into the pr channel containing a summary of open PRs.
    
    Would you like me to run it?"

    **Human:** "Yes, run it"

    **Agent:** _[Agent uses superglue_execute_tool with id: "github-pr-to-slack-channel"]_


  </Tab>
  <Tab title="Data Pipeline Execution">
    **Human:** "Run my daily revenue report"

    **Agent:** _[Agent uses superglue_find_relevant_tools with searchTerms: "revenue report"]_

    "I found your 'stripe-daily-revenue' tool. Running it now..."

    _[Agent uses superglue_execute_tool with id: "stripe-daily-revenue"]_

    "Today's revenue summary:
    - Gross Revenue: $12,450
    - Fees: $412
    - Net Revenue: $12,038
    - New Customers: 23"
  </Tab>
  <Tab title="Parameterized Execution">
    **Human:** "Get all Stripe customers created in the last 7 days"

    **Agent:** _[Agent uses superglue_find_relevant_tools with searchTerms: "stripe customers"]_

    "I found your 'fetch-stripe-customers' tool. Let me run it with a 7-day filter..."

    _[Agent uses superglue_execute_tool with payload: {days: 7}]_

    "Found 15 new customers in the last 7 days: [customer list]"
  </Tab>
</Tabs>

## Best Practices

<CardGroup cols={2}>
  <Card title="Build Tools First" icon="wrench">
    Create and test tools in the [superglue UI](https://app.superglue.cloud) or via SDK before using them in MCP.

    Tools built through the UI benefit from visual debugging, documentation search, and step-by-step testing.
  </Card>
  <Card title="Use Descriptive IDs" icon="tag">
    Name your tools clearly so agents can find them easily:

    **Good:** `fetch-active-users`
    
    **Better:** `fetch-hubspot-active-users-last-30-days`
  </Card>
  <Card title="Search Smart" icon="search">
    Use specific search terms to find the right tool:

    **Broad:** `*` (returns all tools)
    
    **Focused:** `slack notifications`, `stripe revenue`, `hubspot contacts`
  </Card>
  <Card title="Handle Large Results" icon="database">
    Results over 20K chars are truncated. If you need full data:
    
    - Build tools with aggregation/filtering in the workflow
    - Use the SDK directly for large data exports
  </Card>
</CardGroup>

## Authentication & Session Management

The superglue MCP server uses key-based authentication and session management:

- **Authentication**: All requests require a valid superglue API key in the Authorization header
- **Sessions**: MCP interactions are session-based to maintain context across requests

## Troubleshooting

<AccordionGroup>
  <Accordion title="MCP Server Not Connecting" icon="exclamation-triangle">
    **Symptoms:** Claude says "superglue not available" or MCP status shows disconnected

    **Solutions:**

    1. Verify `mcp-remote` is available: `npx mcp-remote --version`
    2. Check your API key is correct in the `AUTH_HEADER` environment variable
    3. Test the endpoint: `curl -H "Authorization: Bearer YOUR_API_KEY" https://mcp.superglue.ai`
    4. Restart Claude Desktop completely
    5. Check the logs: `tail -f ~/Library/Logs/Claude/mcp-*.log`
  </Accordion>
  <Accordion title="Workflow Building Fails" icon="exclamation-triangle">
    **Symptoms:** Agent says it can't understand the integration or API calls fail

    **Solutions:**

    1. Be more specific about what data you want
    2. Check if the integration exists: ask agent to "find integrations for [service]"
    3. Verify your credentials are still valid in the superglue dashboard
    4. Try breaking complex requests into smaller steps
  </Accordion>
  <Accordion title="Authentication Issues" icon="key">
    **Symptoms:** API calls return 401 or 403 errors

    **Solutions:**

    1. Check if integration API keys have expired or been revoked
    2. Verify the integration has the right permissions/scopes
    3. Test credentials directly with the API provider
  </Accordion>
</AccordionGroup>

## Next Steps

<CardGroup cols={2}>
  <Card title="MCP Tools Reference" icon="tools" href="/mcp/mcp-tools">
    Complete reference of all available MCP tools and parameters
  </Card>
  <Card title="SDK Integration" icon="code" href="/agent-builders/sdk-integration">
    Build custom AI applications with full programmatic control
  </Card>
  <Card title="Credential Management" icon="key" href="/agent-builders/credential-management">
    Learn about secure credential storage and runtime credential passing
  </Card>
  <Card title="Example Workflows" icon="workflow" href="/guides/hubspot">
    See real examples of agent workflows with popular integrations
  </Card>
</CardGroup>
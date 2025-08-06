---
title: "Superglue MCP Integration"
description: "Universal MCP tool for reliable agent workflows across any API"
---

Turn any API into workflows so your agents can get things done reliably.

**superglue MCP** provides a universal tool that lets agents build reliable, validated workflows for any app, database or API, simply by requesting them in natural language.

<Info>
MCP (Model Context Protocol) is the easiest way to give AI agents access to external tools and data sources. Superglue provides a universal MCP server that connects to any API.
</Info>

## What You Get with MCP

<CardGroup cols={2}>
  <Card title="One Tool, Any API" icon="universal-access">
    Instead of building separate MCP tools for each API, Superglue gives your agent one powerful tool that connects to everything.
  </Card>
  <Card title="Natural Language" icon="comment">
    Your agent can describe integrations in plain English - no need to learn specific API syntax.
  </Card>
  <Card title="Built-in Reliability" icon="shield">
    Automatic retries, error handling, and rate limiting built into every API call.
  </Card>
  <Card title="Self-Healing" icon="heart">
    When APIs change, Superglue adapts automatically - your agent workflows keep working.
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
    Close and reopen Claude Desktop. You should see "Superglue" connected in the MCP status.
  </Step>
</Steps>

## Available MCP Tools

The Superglue MCP server provides these tools to your agent:

<AccordionGroup>
  <Accordion title="superglue_find_integrations" icon="search">
    **Purpose:** Discover available integrations for your task
    
    **Usage:** 
    > "Find integrations for social media posting"
    
    **What it does:** Returns available integrations like Twitter, LinkedIn, Facebook with their capability descriptions.
  </Accordion>
  
  <Accordion title="superglue_build_and_run_workflow" icon="play">
    **Purpose:** Build and execute workflows in natural language
    
    **Usage:**
    > "Get my latest Stripe transactions and create a summary report"
    
    **What it does:** Creates the workflow, handles authentication, executes API calls, and returns formatted results.
  </Accordion>
  
  <Accordion title="superglue_save_workflow" icon="save">
    **Purpose:** Save successful workflows for reuse
    
    **Usage:**
    > "Save this workflow as 'daily-stripe-report'"
    
    **What it does:** Persists the workflow for future execution with the same reliability.
  </Accordion>
  
  <Accordion title="superglue_execute_workflow" icon="refresh">
    **Purpose:** Run previously saved workflows
    
    **Usage:**
    > "Run the daily-stripe-report workflow"
    
    **What it does:** Executes the saved workflow with current data.
  </Accordion>
  
  <Accordion title="superglue_create_integration" icon="plus">
    **Purpose:** Add new integrations on-the-fly
    
    **Usage:**
    > "Connect to my company's internal API at api.company.com"
    
    **What it does:** Adds new API integrations with credentials and documentation.
  </Accordion>
</AccordionGroup>

## Agent Framework Integration

### LangChain

You can use Superglue with LangChain agents that support MCP:

```python
from langchain_community.tools import MCPTool
from langchain.agents import initialize_agent

# Initialize MCP connection to Superglue
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

# Create Superglue tool
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

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/hubspot.mp4" />

<Tabs>
  <Tab title="Data Analysis">
    **Human:** "Analyze my business performance across Stripe, HubSpot, and Google Analytics"
    
    **Agent:** "I'll help you analyze your business performance across those platforms. Let me gather the data from each source and create a comprehensive analysis.
    
    First, let me find the available integrations..."
    
    *[Agent uses superglue_find_integrations]*
    
    "Great! I can see you have Stripe, HubSpot, and Google Analytics connected. Now I'll build a workflow to gather data from all three sources..."
    
    *[Agent uses superglue_build_and_run_workflow]*
    
    "Here's your business performance analysis: [detailed results with revenue trends, lead conversion, traffic patterns]"
  </Tab>
  
  <Tab title="Multi-Step Workflow">
    **Human:** "When someone subscribes to my Stripe plan, add them to HubSpot and send a Slack notification"
    
    **Agent:** "I'll create an automated workflow that triggers when someone subscribes. Let me build this integration...
    
    *[Agent uses superglue_build_and_run_workflow with webhook setup]*
    
    This workflow will:
    1. Monitor Stripe for new subscriptions
    2. Automatically add new subscribers to HubSpot as contacts
    3. Send a formatted Slack notification to your team
    
    Would you like me to save this workflow for ongoing use?"
  </Tab>
  
  <Tab title="Custom Integration">
    **Human:** "Connect to my company's internal inventory API and get current stock levels"
    
    **Agent:** "I'll need to add your internal API as a new integration first. Let me set that up...
    
    *[Agent uses superglue_create_integration]*
    
    I've added your inventory API. What authentication does it require? API key, OAuth, or something else?"
    
    **Human:** "It uses an API key in the Authorization header"
    
    **Agent:** "Perfect! Now let me fetch your current stock levels...
    
    *[Agent uses superglue_build_and_run_workflow]*
    
    Here are your current stock levels: [formatted inventory data]"
  </Tab>
</Tabs>

## Best Practices

<CardGroup cols={2}>
  <Card title="Be Specific" icon="target">
    **Good:** "Get Stripe customers created in the last 7 days with email and subscription status"
    
    **Better:** "Get active Stripe customers created in the last 7 days, include email, name, subscription status, and MRR"
  </Card>
  
  <Card title="Use Response Schemas" icon="code">
    When building workflows, you can specify the output format:
    
    ```json
    {
      "type": "object",  
      "properties": {
        "customers": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "email": {"type": "string"},
              "mrr": {"type": "number"}
            }
          }
        }
      }
    }
    ```
  </Card>
  
  <Card title="Add context" icon="shield">
    You can improve the performance of your agent by adding context to the workflow:
    
    > "You need to get an auth token first before each request to get the data."
  </Card>
  
  <Card title="Save Successful Workflows" icon="save">
    When a workflow works well, save it for reuse:
    
    > "This worked perfectly! Save it as 'weekly-revenue-report' so I can run it regularly."
  </Card>
</CardGroup>

## Authentication & Session Management

The Superglue MCP server uses key-based authentication and session management:

- **Authentication**: All requests require a valid Superglue API key in the Authorization header
- **Sessions**: MCP interactions are session-based to maintain context across requests

## Troubleshooting

<AccordionGroup>
  <Accordion title="MCP Server Not Connecting" icon="exclamation-triangle">
    **Symptoms:** Claude says "Superglue not available" or MCP status shows disconnected
    
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
    3. Verify your credentials are still valid in the Superglue dashboard
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
  <Card title="MCP Tools Reference" href="/mcp/mcp-tools" icon="tools">
    Complete reference of all available MCP tools and parameters
  </Card>
  <Card title="SDK Integration" href="/agent-builders/sdk-integration" icon="code">
    Build custom AI applications with full programmatic control
  </Card>
  <Card title="Credential Management" href="/agent-builders/credential-management" icon="key">
    Learn about secure credential storage and runtime credential passing
  </Card>
  <Card title="Example Workflows" href="/guides/hubspot" icon="workflow">
    See real examples of agent workflows with popular integrations
  </Card>
</CardGroup>
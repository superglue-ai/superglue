---
title: "30-Second Setup for Agent Builders"
description: "Get your AI agents connected to any API in under 30 seconds"
---

## What Superglue Does for You

Superglue acts as a **universal MCP tool** that gives your agents reliable access to any API or database. Instead of building custom tools for each integration, your agent gets one powerful tool that can connect to anything.

## 30-Second Setup

<Steps>
  <Step title="Choose Your Integration Method">
    <Tabs>
      <Tab title="MCP (Recommended for Agents)">
        Perfect for Claude Desktop, agent frameworks, and any MCP-compatible system.

        ```bash
        # Add to your MCP settings
        {
          "mcpServers": {
            "superglue": {
              "command": "npx",
              "args": ["@superglue/mcp-server"],
              "env": {
                "SUPERGLUE_API_KEY": "your_api_key_here"
              }
            }
          }
        }
        ```
      </Tab>
      <Tab title="SDK (For Custom Apps)">
        Perfect for building custom AI applications with full control.

        ```bash
        npm install @superglue/client
        ```

        ```typescript
        import { SuperglueClient } from "@superglue/client";
        
        const superglue = new SuperglueClient({
          apiKey: "your_api_key_here"
        });
        ```
      </Tab>
    </Tabs>
  </Step>
  <Step title="Get Your API Key">
    Get your free API key from [app.superglue.cloud](https://app.superglue.cloud) in 10 seconds.

    <Tip>
      **Self-hosting?** Skip the API key and [deploy locally](/guides/self-hosting) instead.
    </Tip>
  </Step>
  <Step title="Test with Your First Workflow">
    <Tabs>
      <Tab title="Via MCP">
        Create a custom [GitHub API key](https://github.com/settings/personal-access-tokens/new) for superglue.

        In Claude Desktop or your agent framework:

        > "Use Superglue to get the latest issues from the GitHub repository microsoft/vscode and summarize the top 3. My api key is ...."

        That's it\! Superglue will automatically handle the GitHub API integration.

        Alternatively, you can use an API that does not need any authentication:

        > "Use superglue to get all products from https://timbuk2.com/products.json."
      </Tab>
      <Tab title="Via SDK">
        ```typescript
        const result = await superglue.buildAndExecuteWorkflow({
          instruction: "Get the latest issues from GitHub repo microsoft/vscode",
          integrationIds: ["github"],
          responseSchema: {
            type: "object",
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object", 
                  properties: {
                    title: { type: "string" },
                    state: { type: "string" },
                    created_at: { type: "string" }
                  }
                }
              }
            }
          }
        });
        ```
      </Tab>
    </Tabs>
  </Step>
</Steps>

## How It Works for Agents

<CardGroup cols={2}>
  <Card title="Build & Run Combined" icon="zap">
    With MCP, building and running workflows happens in one step. Just describe
    what you want in natural language.
  </Card>
  <Card title="Automatic Error Handling" icon="shield">
    Superglue handles authentication, rate limits, retries, and data
    transformation automatically.
  </Card>
  <Card title="Any API or Database" icon="database">
    Works with REST, GraphQL, SQL databases, even SOAP/XML - anything with an endpoint.
  </Card>
  <Card title="Reliable & Deterministic" icon="check">
    Built for production agent workflows with consistent, predictable results.
  </Card>
</CardGroup>

## Credential Management Options

<Tabs>
  <Tab title="superglue manages credentials">
    **Easiest option:** Store credentials securely in superglue.

    - Add integrations through the web interface or the chat agent and add your credentials.
    - Credentials are encrypted and never logged.
    - Perfect for development and trusted environments.
  </Tab>
  <Tab title="You manage credentials">
    **Maximum security:** Pass credentials at runtime.

    ```typescript
    // Via SDK
    await superglue.executeWorkflow({
      workflowId: "my-workflow",
      credentials: {
        github_token: process.env.GITHUB_TOKEN,
        stripe_key: process.env.STRIPE_SECRET_KEY
      }
    });
    ```

    Perfect for production environments with strict security requirements.
  </Tab>
</Tabs>

## Next Steps

<CardGroup cols={2}>
  <Card title="MCP Integration" icon="plug" href="/agent-builders/mcp-integration">
    Deep dive into using Superglue with Claude Desktop, agent frameworks, and
    MCP
  </Card>
  <Card title="SDK Integration" icon="code" href="/agent-builders/sdk-integration">
    Build custom AI applications with the Superglue SDK
  </Card>
  <Card title="Credential Management" icon="key" href="/agent-builders/credential-management">
    Learn about different approaches to managing API credentials
  </Card>
  <Card title="MCP Tools Reference" icon="wrench" href="/mcp/mcp-tools">
    Complete reference of all available MCP tools and capabilities
  </Card>
</CardGroup>

---

<Card title="Need help?" icon="question">
  Join our [Discord community](https://discord.gg/vUKnuhHtfW) or [book a
  demo](https://cal.com/superglue/superglue-demo) to talk with our team.
</Card>
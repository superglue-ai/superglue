---
title: "30-Second Setup for Data Engineers"
description: "Build robust data pipelines and API integrations 10x faster than traditional coding"
---

## What superglue Does for You

superglue eliminates the complexity of API integrations and data transformations. Instead of writing boilerplate code for each API, handling schema changes, and managing error cases, you describe what you want in natural language.

[**We're 50% more reliable than LLMs in writing integration code →**](https://superglue.ai/api-ranking/)

## 30-Second Setup

<Steps>
  <Step title="Choose Your Interface">
    <Tabs>
      <Tab title="UI/Chat (Fastest)">
        Perfect for rapid prototyping and testing integrations.

        1. Go to [app.superglue.cloud](https://app.superglue.cloud)
        2. Sign up for free account
        3. Start building workflows in the chat interface
      </Tab>
      <Tab title="SDK (For Full Control)">
        Perfect for production implementations and CI/CD pipelines.

        ```bash
        npm install @superglue/client
        ```

        Get your API key from [app.superglue.cloud](https://app.superglue.cloud)
      </Tab>
      <Tab title="Cursor via MCP">
        Perfect for coding with AI assistance directly in your IDE.

        ```bash
        # Add to your MCP settings  
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
                "AUTH_HEADER": "Bearer your_api_key_here"
              }
            }
          }
        }
        ```
      </Tab>
    </Tabs>
    ![Screenshot 2025-08-06 at 11.50.13.png](/docs/images/Screenshot2025-08-06at11.50.13.png)
  </Step>
  <Step title="Create Your First Integration">
    <Tabs>
      <Tab title="Via UI/Chat">
        In the chat interface:

        > "Connect to Stripe API and get all customers created in the last 30 days, transform the data to include only email, name, and subscription status"

        superglue will guide you through adding credentials and testing the integration.
      </Tab>
      <Tab title="Via SDK">
        ```typescript
        import { SuperglueClient } from "@superglue/client";
        
        const superglue = new SuperglueClient({
          apiKey: "your_api_key_here"
        });
        
        const integration = await superglue.upsertIntegration({
        	id: "stripe",
        	urlHost: "https://api.stripe.com",
        	documentationUrl: "https://docs.stripe.com/api",
        	credentials: {
        		apiKey: "sk_......."
        	}
        });
        
        const workflow = await superglue.buildWorkflow({
          id: "stripe-customers"
          instruction: "Get Stripe customers from last 30 days with email, name, and subscription status",
          integrationIds: ["stripe"],
          responseSchema: {
            type: "object",
            properties: {
              customers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    email: { type: "string" },
                    name: { type: "string" },
                    subscription_status: { type: "string" }
                  }
                }
              }
            }
          }
        });
        
        const result = await superglue.executeWorkflow({ workflow });
        ```
      </Tab>
    </Tabs>
  </Step>
  <Step title="Save & Deploy">
    <Tabs>
      <Tab title="Save for Reuse">
        After testing, save your workflow for production use:

        ```typescript
        const savedWorkflow = await superglue.upsertWorkflow(workflow.id, result.workflow);
        ```
      </Tab>
      <Tab title="Run in Production">
        Execute saved workflows reliably:

        ```typescript
        const production = await superglue.executeWorkflow({
          workflowId: "stripe-customer-sync",
          credentials: {
            stripe_key: process.env.STRIPE_SECRET_KEY
          }
        });
        ```
      </Tab>
    </Tabs>
  </Step>
</Steps>

## Why Use superglue vs Traditional Coding

<CardGroup cols={2}>
  <Card title="10x Faster Development" icon="rocket">
    **Traditional:** Write API clients, handle pagination, manage schemas, build
    error handling

    **superglue:** Describe your requirements in natural language
  </Card>
  <Card title="Self-Healing Pipelines" icon="heart">
    **Traditional:** Breaks when APIs change, requires manual fixes \
    **superglue:** Automatically adapts to schema changes and API updates
  </Card>
  <Card title="Built-in Resilience" icon="shield">
    **Traditional:** You implement retries, rate limiting, error handling
    **superglue:** All reliability features included
  </Card>
  <Card title="Universal Access" icon="database">
    **Traditional:** Different code for REST, GraphQL, SQL, CSV, SOAP/XML \
    **superglue:** One interface for all data sources
  </Card>
</CardGroup>

## The 3-Step Process

<Steps>
  <Step title="Build" icon="hammer">
    Describe your data pipeline in natural language. superglue figures out the
    API calls, transformations, and error handling.
  </Step>
  <Step title="Test & Iterate" icon="map">
    Run and refine your workflow. See exactly what's happening with real-time
    logs and debugging.
  </Step>
  <Step title="Save & Deploy" icon="rocket">
    Save successful workflows for production use. Execute them reliably with
    your own credentials.
  </Step>
</Steps>

## Common Use Cases

<Tabs>
  <Tab title="Data Pipelines">
    ```typescript
    // Sync HubSpot contacts to your database daily
    await superglue.buildWorkflow({
      id: "hubspot-contacts",
      instruction: "Get all HubSpot contacts updated in last 24 hours and insert into PostgreSQL customers table",
      integrationIds: ["hubspot", "postgresql"]
    });
    ```
  </Tab>
  <Tab title="API Orchestration">
    ```typescript
    // Multi-step workflow across different APIs
    await superglue.buildWorkflow({
      id: "account-flow",
      instruction: "Get Stripe customers, enrich with HubSpot data, and create Jira tickets for high-value accounts",
      integrationIds: ["stripe", "hubspot", "jira"]
    });
    ```
  </Tab>
  <Tab title="Legacy Modernization">
    ```typescript
    // Wrap legacy SOAP APIs with modern interfaces
    await superglue.buildWorkflow({
      id: "soap-migration",
      instruction: "Query legacy inventory system and transform to modern REST API format",
      integrationIds: ["legacy-soap"]
    });
    ```
  </Tab>
</Tabs>

## Next Steps

<CardGroup cols={2}>
  <Card title="UI vs SDK Comparison" icon="scale" href="/data-engineers/ui-vs-sdk">
    When to use the chat interface vs the SDK for different scenarios
  </Card>
  <Card title="API Ranking Benchmark" icon="trophy" href="/data-engineers/api-ranking">
    See how superglue compares to traditional coding approaches
  </Card>
  <Card title="Data Pipeline Patterns" icon="workflow" href="/data-engineers/data-pipelines">
    Common patterns for ETL, real-time sync, and data transformation
  </Card>
  <Card title="Self-Hosting Guide" icon="server" href="/guides/self-hosting">
    Deploy superglue in your own infrastructure with your own llms.
  </Card>
</CardGroup>

---

<Card title="Ready to move beyond traditional API integration?" icon="rocket">
  [Start building in the UI](https://app.superglue.cloud) or [book a
  demo](https://cal.com/superglue/superglue-demo) to see how others are using
  superglue.
</Card>
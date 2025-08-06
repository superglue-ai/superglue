---
title: "SDK Integration Guide"
description: "Build custom AI applications with the superglue SDK"
---

<Info>
  The superglue SDK gives you full programmatic control for building custom AI
  applications that need reliable API integrations.
</Info>

## When to Use the SDK vs MCP

<Tabs>
  <Tab title="Use SDK When">
    ✅ Requiring full control over the integration flow \
    ✅ Embedding superglue in your own products \
    ✅ Building production systems with specific requirements \
    ✅ Handling authentication, errors, and retries yourself
  </Tab>
  <Tab title="Use MCP When">
    ✅ Working with existing agent frameworks and tools (Claude, LangChain, etc.) \
    ✅ Building conversational AI experiences \
    ✅ Handling authentication with superglue \
    ✅ Relying on automatic error handling and retries
  </Tab>
</Tabs>

## Installation & Setup

```bash
npm install @superglue/client
```

```typescript
import { SuperglueClient } from "@superglue/client";

const superglue = new SuperglueClient({
  apiKey: "your_api_key_here", // Get from app.superglue.cloud
  baseUrl: "https://api.superglue.cloud", // Optional, defaults to hosted version
});
```

<Tip>
  **Self-hosting?** Set `baseUrl` to your instance URL.
</Tip>

## Core SDK Methods

### Building and Running Workflows

The superglue SDK uses a two-step process for workflows:

1. **`buildWorkflow()`** - Creates a workflow from your instruction and integrations
2. **`executeWorkflow()`** - Executes a workflow (either by ID or by passing the workflow object)

<Tip>
  This separation gives you flexibility: build once, execute many times with different payloads, or save workflows for later use.
</Tip>

The most powerful method for AI applications - describe what you want and get it done:

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

### Working with Saved Workflows

```typescript
// Execute a previously saved workflow
const execution = await superglue.executeWorkflow({
  id: "customer-subscription-report",
  payload: {
    limit: 100,
    created_after: "2024-01-01",
  },
  credentials: {
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
  },
});

// List available workflows
const workflows = await superglue.listWorkflows();

// Get workflow details
const workflow = await superglue.getWorkflow("customer-subscription-report");
```

### Managing Integrations

```typescript
// Find relevant integrations for your use case
const integrations = await superglue.findRelevantIntegrations(
  "I need to sync customer data between my CRM and billing system"
);

// Create a new integration
await superglue.upsertIntegration({
  id: "internal-crm",
  name: "Internal CRM API",
  urlHost: "https://crm.company.com",
  credentials: {
    api_key: "your_crm_api_key",
  },
  documentationUrl: "https://docs.crm.com",
});

// List all integrations
const allIntegrations = await superglue.listIntegrations();
```

## Building AI Applications

### Example: Customer Support AI

```typescript
class CustomerSupportAI {
  private superglue: SuperglueClient;

  constructor(apiKey: string) {
    this.superglue = new SuperglueClient({ apiKey });
  }

  async handleCustomerQuery(query: string, customerId: string) {
    // Get customer context from multiple sources
    const workflow = await this.superglue.buildWorkflow({
      id: "customer-data",
      instruction: `Get comprehensive customer data for customer ID ${customerId} including:
        - Stripe subscription and billing history  
        - HubSpot contact details and interaction history
        - Zendesk support ticket history`,
      integrationIds: ["stripe", "hubspot", "zendesk"],
      payload: { customerId },
      responseSchema: {
        type: "object",
        properties: {
          billing: { type: "object" },
          contact: { type: "object" },
          support_history: { type: "array" },
        },
      },
    });
	const result = await this.superglue.executeWorkflow({ workflow });
    if (!result.success) {
      throw new Error("Failed to get customer context");
    }

    // Use the context to provide personalized support
    return this.generateResponse(query, result.data);
  }

  private generateResponse(query: string, context: any) {
    // Your AI logic here using the customer context
    return `Based on your account (${context.billing.status}) and previous interactions...`;
  }
}
```

### Example: Data Pipeline Automation

```typescript
class DataPipelineManager {
  private superglue: SuperglueClient;

  constructor(apiKey: string) {
    this.superglue = new SuperglueClient({ apiKey });
  }

  async syncCustomerData() {
    try {
      // Multi-step data pipeline
      const workflow = await this.superglue.buildWorkflow({
        instruction: `Daily customer data sync:
          1. Get new Stripe customers from last 24 hours
          2. Enrich with HubSpot contact data  
          3. Insert into PostgreSQL customers table
          4. Send Slack notification with summary`,
        integrationIds: ["stripe", "hubspot", "postgresql", "slack"],
        responseSchema: {
          type: "object",
          properties: {
            new_customers: { type: "number" },
            synced_records: { type: "number" },
            notification_sent: { type: "boolean" },
          },
        },
        save: false, // Don't save, just build and execute
      });

      // Execute the built workflow
      const result = await this.superglue.executeWorkflow({
        workflow: workflow,
      });

      if (result.success) {
        console.log(`Synced ${result.data.synced_records} customer records`);
        return result.data;
      } else {
        throw new Error(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Pipeline failed:", error);
      await this.sendErrorAlert(error);
      throw error;
    }
  }

  private async sendErrorAlert(error: Error) {
    await this.superglue.executeWorkflow({
      workflowId: "error-alert-workflow",
      payload: {
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

### Example: Multi-Agent Orchestration

```typescript
class AgentOrchestrator {
  private superglue: SuperglueClient;

  constructor(apiKey: string) {
    this.superglue = new SuperglueClient({ apiKey });
  }

  async orchestrateBusinessWorkflow(task: string) {
    // AI agent determines what integrations are needed
    const integrations = await this.superglue.findRelevantIntegrations(task);

    // Build and execute the workflow
    const workflow = await this.superglue.buildWorkflow({
      instruction: task,
      integrationIds: integrations.map((i) => i.id),
      responseSchema: {
        type: "object",
        properties: {
          status: { type: "string" },
          results: { type: "object" },
          next_actions: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      save: false,
    });

    const result = await this.superglue.executeWorkflow({
      workflow: workflow,
    });

    if (result.success && result.data.next_actions?.length > 0) {
      // Recursively handle follow-up actions
      for (const nextAction of result.data.next_actions) {
        await this.orchestrateBusinessWorkflow(nextAction);
      }
    }

    return result;
  }
}
```

## Error Handling & Reliability

```typescript
async function robustWorkflowExecution() {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const workflow = await superglue.buildWorkflow({
        instruction: "Get customer data from Stripe",
        integrationIds: ["stripe"],
        save: false,
      });

      const result = await superglue.executeWorkflow({
        workflow: workflow,
        // Optional: Configure timeout and retry behavior
        options: {
          timeout: 30000, // 30 seconds
          retries: 2,
          retryDelay: 1000, // 1 second between retries
        },
      });

      if (result.success) {
        return result.data;
      } else {
        console.warn(`Workflow failed: ${result.error}`);
        if (result.retriable) {
          attempt++;
          continue;
        } else {
          throw new Error(result.error);
        }
      }
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

## Advanced Configuration

### Custom Base URL & Authentication

```typescript
const superglue = new SuperglueClient({
  baseUrl: "https://your-superglue-instance.com",
  apiKey: "your_api_key",
  timeout: 60000, // 60 seconds
  retries: 3,
  headers: {
    "X-Custom-Header": "value",
  },
});
```

### Webhook Integration

```typescript
// Set up webhooks for long-running workflows
const workflow = await superglue.buildWorkflow({
  instruction: "Process large dataset from database",
  integrationIds: ["postgresql"],
  save: false,
});

const webhookResult = await superglue.executeWorkflow({
  workflow: workflow,
  options: {
    webhookUrl: "https://your-app.com/webhooks/superglue",
  },
});

// Handle webhook in your app
app.post("/webhooks/superglue", (req, res) => {
  const { workflowId, status, data, error } = req.body;

  if (status === "completed") {
    console.log(`Workflow ${workflowId} completed:`, data);
  } else if (status === "failed") {
    console.error(`Workflow ${workflowId} failed:`, error);
  }

  res.status(200).send("OK");
});
```

## TypeScript Support

The SDK is fully typed for excellent developer experience:

```typescript
import {
  SuperglueClient,
  WorkflowResult,
  Integration,
  ExecutionStep,
} from "@superglue/client";

// All responses are properly typed
const workflow = await superglue.buildWorkflow({
  instruction: "Get Stripe customers",
  integrationIds: ["stripe"],
  responseSchema: {
    type: "object",
    properties: {
      customers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
          },
        },
      },
    },
  },
  save: false,
});

const result: WorkflowResult = await superglue.executeWorkflow({
  workflow: workflow,
});

// TypeScript knows the shape of result.data
if (result.success) {
  result.data.customers.forEach((customer) => {
    console.log(customer.email); // Fully typed!
  });
}
```

## Next Steps

<CardGroup cols={2}>
  <Card title="Credential Management" icon="key" href="/agent-builders/credential-management">
    Learn about secure credential storage and runtime credential passing
  </Card>
  <Card title="Complete MCP Guide" icon="plug" href="/mcp/mcp">
    Compare SDK approach with MCP for different use cases
  </Card>
  <Card title="API Reference" icon="book" href="/api-reference/overview">
    Complete SDK method reference and parameters
  </Card>
  <Card title="Example Apps" icon="code" href="/guides/hubspot">
    See complete example applications built with the SDK
  </Card>
</CardGroup>
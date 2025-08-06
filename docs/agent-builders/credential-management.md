---
title: "Credential Management"
description: "Secure approaches to managing API credentials with superglue"
---

superglue handles credential management primarily through its encrypted vault. You can also pass credentials at runtime, which is useful for multi-user scenarios.

<Note>
**Flexible Credential Naming**: The exact naming of credentials, except for OAuth cases, is not vital, since superglue maps credentials to the request automatically. This means that e.g. if the token has to be passed as a `X-SERVICE-API-KEY`, it is acceptable to name the token "api_key". Given documentation and context, superglue will figure out how to place the API key to successfully complete the request.
</Note>

## Two Approaches

<CardGroup cols={2}>
  <Card title="Store credentials in integration" icon="key">
    **Best for:** Single-user environments / one integration per user setups / MCP setups

    **How it works:** 

    - - Store credentials securely in superglue's encrypted vault 

    - Credentials are automatically used for integrations 

    - No need to pass credentials with each API call

    - superglue manages oauth
  </Card>
  <Card title="Provide credentials at runtime" icon="key">
    **Best for:** Complex multi-user scenarios and SDK setups.

    **How it works:** 

    - Keep credentials in your own secure storage\
    (environment variables, vault, etc.) 

    - Pass credentials at runtime with each workflow execution

    - superglue never stores your credentials

    - Supports 1:n integration:user scenarios.
  </Card>
</CardGroup>

## Approach 1: superglue-Managed Credentials

### Setup via Web Interface

1. Go to [app.superglue.cloud](https://app.superglue.cloud)
2. Navigate to "Integrations"
3. Add your integrations with credentials:

<Steps>
  <Step title="Add Integration">
    Click "Add Integration" and select your service (Stripe, HubSpot, etc.)
  </Step>
  <Step title="Enter Credentials">
    Provide your API keys, OAuth tokens, or database connection strings
  </Step>
  <Step title="Save Securely" stepNumber={3}>
    Credentials are encrypted and stored securely in superglue's vault
  </Step>
</Steps>

### Setup via SDK

```typescript
import { SuperglueClient } from "@superglue/client";

const superglue = new SuperglueClient({
  apiKey: "your_superglue_api_key",
});

// Create integration with stored credentials
await superglue.upsertIntegration({
  id: "my-stripe",
  name: "Stripe Production",
  urlHost: "https://api.stripe.com",
  credentials: {
    stripe_secret_key: "sk_live_..." // This gets encrypted and stored
  },
  specificInstructions: "Use live Stripe API with rate limiting",
});
```

### Using Stored Credentials

```typescript
// First build the workflow
const workflow = await superglue.buildWorkflow({
  instruction: "Get all Stripe customers from last month",
  integrationIds: ["my-stripe"], // Uses stored credentials automatically
  responseSchema: {
    type: "object",
    properties: {
      customers: {
        type: "array",
        items: { type: "object" },
      },
    },
  },
});

// Then execute it
const result = await superglue.executeWorkflow({
  workflow,
});
```

### Setup via MCP

With MCP, credentials are managed through the web interface and automatically used:

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
        "AUTH_HEADER": "Bearer your_superglue_api_key"
      }
    }
  }
}
```

Then in Claude Desktop:

> "Connect to my Stripe account and get recent transactions"

superglue will use the stored Stripe credentials automatically.

## Approach 2: Runtime Credential Passing

### Environment-Based Credentials

```typescript
// Store in environment variables
process.env.STRIPE_SECRET_KEY = "sk_live_...";
process.env.HUBSPOT_API_KEY = "pat-...";
process.env.DATABASE_URL = "postgresql://...";

// First build the workflow
const workflow = await superglue.buildWorkflow({
  instruction: "Sync Stripe customers to database via HubSpot",
  integrationIds: ["stripe", "hubspot", "postgresql"],
});

// Then execute with credentials passed at runtime
const result = await superglue.executeWorkflow({
  workflow,
  credentials: {
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
    hubspot_api_key: process.env.HUBSPOT_API_KEY,
    database_url: process.env.DATABASE_URL,
  },
});
```

### Vault Integration

```typescript
import { VaultService } from "./your-vault-service";

class SecureWorkflowExecutor {
  private vault: VaultService;
  private superglue: SuperglueClient;

  constructor() {
    this.vault = new VaultService();
    this.superglue = new SuperglueClient({
      apiKey: process.env.SUPERGLUE_API_KEY,
    });
  }

  async executeWorkflow(workflowId: string, userId: string) {
    // Fetch credentials securely from your vault
    const credentials = await this.vault.getCredentials(userId, [
      "stripe_key",
      "hubspot_token",
      "database_password",
    ]);

    // Execute with runtime credentials
    const result = await this.superglue.executeWorkflow({
      workflowId,
      credentials: {
        stripe_secret_key: credentials.stripe_key,
        hubspot_api_key: credentials.hubspot_token,
        db_password: credentials.database_password,
      },
    });

    return result;
  }
}
```

### OAuth Token Management

<Info>
  **superglue handles OAuth automatically\!** Token refresh, expiration management, and OAuth flows are all managed by superglue. You just need to provide the initial OAuth credentials.
</Info>

**What superglue handles for you:**

- ✅ Token refresh when expired
- ✅ OAuth flow management
- ✅ Scope validation
- ✅ Rate limiting with OAuth APIs
- ✅ Error handling for token issues

**What you need to provide:**

- Client ID and Client Secret
- Scopes (if custom)
- Authorization URL (if not using templates)

```typescript
// Simple OAuth setup - superglue does the rest
await superglue.upsertIntegration("hubspot-oauth", {
  id: "hubspot-oauth",
  name: "HubSpot OAuth",
  urlHost: "https://api.hubapi.com",
  credentials: {
    client_id: "your_hubspot_client_id",
    client_secret: "your_hubspot_client_secret",
    // superglue handles token refresh automatically
  },
  specificInstructions: "Use OAuth2 with contacts and deals scopes"
});

// Use it in workflows - no token management needed
const workflow = await superglue.buildWorkflow({
  instruction: "Get all HubSpot contacts created this month",
  integrationIds: ["hubspot-oauth"]
});

const result = await superglue.executeWorkflow({ workflow });
```

<Note>
  We have pre-built OAuth templates for popular APIs like HubSpot, Google Ads, Salesforce, and more. You can create a new integration and check the templates to see what is available. If an integration is not available, you can always create it manually and add auth url and scopes. Talk to us if you need help with this.
</Note>

## Integration-Specific Credential Patterns

### Database Connections

```typescript
// Stored credentials (connection string)
await superglue.upsertIntegration({
  id: "main-db",
  urlHost: "postgresql://<<user>>:<<password>>@<<host>>:<<port>>",
  urlPath: "/<<database_name>>",
  credentials: {
    user: "user",
    password: "pass",
    host: "host",
    port: 5432,
    database: "db",
  },
});
const result = await superglue.executeWorkflow({
  workflowId: "db-query",
  integrationIds: ["main-db"]
});

// Runtime credentials - this can be useful if you want to connect to different databases with one workflow (e.g. one set of credentials for each user)
const result = await superglue.executeWorkflow({
  workflowId: "db-query",
  credentials: {
    user: "user",
    password: "pass",
    host: "host",
    port: 5432,
    database: "db",
  }
});
```

### OAuth APIs (HubSpot, Google, etc.)

For oauth integrations, you might need to authenticate the user through the web interface. To do so, set the client id and client secret, then open the integration in the web interface and click "Save" to open the authentication flow. Alternatively, you can set access token and refresh token manually:

```typescript
// Stored OAuth tokens
await superglue.upsertIntegration({
  id: "hubspot-crm",
  credentials: {
    access_token: "pat-na1-...", // optional - alternatively create a new integration in the browser and authenticate there
    refresh_token: "refresh_token_here", // optional
    client_id: "your_app_client_id",
    client_secret: "your_app_client_secret",
  },
});

// Runtime OAuth tokens
const result = await superglue.executeWorkflow({
  workflowId: "hubspot-sync",
  credentials: {
    hubspot_token: await getValidHubSpotToken(userId),
  },
});
```

## Choosing the Right Approach

<Tabs>
  <Tab title="Single User Scenarios">
    **Use superglue-managed credentials:**

    ✅ Faster setup and iteration\
    ✅ No credential management complexity\
    ✅ Easy testing across team members\
    ✅ Built-in credential validation

    ```typescript
    const workflow = await superglue.buildWorkflow({
      instruction: "Test Stripe integration",
      integrationIds: ["stripe-dev"] // Uses stored test credentials
    });
    
    await superglue.executeWorkflow({ workflow });
    ```
  </Tab>
  <Tab title="Multi-user Scenarios">
    **Either: Create a new integration for each user or use a single integration with runtime credentials**

    ✅ Maximum authentication control\
    ✅ Isolation of credentials

    ```typescript
    // One integration per user
    const workflow = await superglue.buildWorkflow({
      instruction: "Test Stripe integration",
      integrationIds: [`stripe-dev-${userId}`] // Uses user-specific test credentials
    });
    
    await superglue.executeWorkflow({ workflow });
    ```

    ```typescript
    // Alternatively, use runtime credentials
    const credentials = await vault.getCredentials(userId);
    await superglue.executeWorkflow({
      workflowId: savedWorkflow.id,
      credentials
    });
    ```
  </Tab>
</Tabs>

## Next Steps

<CardGroup cols={2}>
  <Card title="MCP Integration" icon="plug" href="/mcp/mcp">
    Learn how credential management works with MCP and agent frameworks
  </Card>
  <Card title="SDK Integration" icon="code" href="/agent-builders/sdk-integration">
    See examples of credential management in custom applications
  </Card>
  <Card title="Self-Hosting" icon="server" href="/guides/self-hosting">
    Set up your own superglue instance with full credential control
  </Card>
  <Card title="OAuth Guide" icon="key" href="/guides/oauth-integrations">
    Deep dive into OAuth integrations and token management
  </Card>
</CardGroup>
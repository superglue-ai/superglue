---
title: "Credential Management"
description: "Secure approaches to managing API credentials with Superglue"
---

<Info>
  Superglue offers flexible credential management - you can store credentials
  securely in Superglue or pass them at runtime for maximum security control.
</Info>

## Two Approaches

<Tabs>
  <Tab title="Superglue Manages Credentials">
    **Best for:** Development, prototyping, trusted environments **How it
    works:** - Store credentials securely in Superglue's encrypted vault -
    Credentials are automatically used for integrations - No need to pass
    credentials with each API call - Perfect for rapid development and testing
  </Tab>
  <Tab title="You Manage Credentials">
    **Best for:** Production, high-security environments, compliance
    requirements **How it works:** - Keep credentials in your own secure storage
    (environment variables, vault, etc.) - Pass credentials at runtime with each
    workflow execution - Superglue never stores your credentials - Full auditing
    and control over credential access
  </Tab>
</Tabs>

## Approach 1: Superglue-Managed Credentials

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
  <Step title="Test Connection">
    Superglue automatically tests the credentials to ensure they work
  </Step>
  <Step title="Save Securely">
    Credentials are encrypted and stored securely in Superglue's vault
  </Step>
</Steps>

### Setup via SDK

```typescript
import { SuperglueClient } from "@superglue/client";

const superglue = new SuperglueClient({
  apiKey: "your_superglue_api_key",
});

// Create integration with stored credentials
await superglue.createIntegration({
  id: "my-stripe",
  name: "Stripe Production",
  urlHost: "https://api.stripe.com",
  credentials: {
    stripe_secret_key: "sk_live_...", // This gets encrypted and stored
    publishable_key: "pk_live_...",
  },
  specificInstructions: "Use live Stripe API with rate limiting",
});
```

### Using Stored Credentials

```typescript
// No need to pass credentials - they're automatically used
const result = await superglue.buildAndExecuteWorkflow({
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
```

### Setup via MCP

With MCP, credentials are managed through the web interface and automatically used:

```json
{
  "mcpServers": {
    "superglue": {
      "command": "npx",
      "args": ["@superglue/mcp-server"],
      "env": {
        "SUPERGLUE_API_KEY": "your_superglue_api_key"
      }
    }
  }
}
```

Then in Claude Desktop:

> "Connect to my Stripe account and get recent transactions"

Superglue will use the stored Stripe credentials automatically.

## Approach 2: Runtime Credential Passing

### Environment-Based Credentials

```typescript
// Store in environment variables
process.env.STRIPE_SECRET_KEY = "sk_live_...";
process.env.HUBSPOT_API_KEY = "pat-...";
process.env.DATABASE_URL = "postgresql://...";

// Pass at runtime
const result = await superglue.buildAndExecuteWorkflow({
  instruction: "Sync Stripe customers to database via HubSpot",
  integrationIds: ["stripe", "hubspot", "postgresql"],
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

```typescript
class OAuthCredentialManager {
  private tokenStore: TokenStore;
  private superglue: SuperglueClient;

  async executeWithOAuth(userId: string, instruction: string) {
    // Get fresh OAuth tokens
    const tokens = await this.tokenStore.getValidTokens(userId);

    // Check if tokens need refresh
    if (this.isTokenExpiring(tokens.hubspot_token)) {
      tokens.hubspot_token = await this.refreshToken(tokens.refresh_token);
    }

    // Execute with fresh tokens
    return await this.superglue.buildAndExecuteWorkflow({
      instruction,
      integrationIds: ["hubspot", "google-ads"],
      credentials: {
        hubspot_token: tokens.hubspot_token,
        google_ads_token: tokens.google_ads_token,
      },
    });
  }

  private isTokenExpiring(token: string): boolean {
    // Your token expiration logic
    return false;
  }

  private async refreshToken(refreshToken: string): Promise<string> {
    // Your token refresh logic
    return "new_token";
  }
}
```

## Integration-Specific Credential Patterns

### Stripe

```typescript
// Stored credentials approach
await superglue.createIntegration({
  id: "stripe-prod",
  credentials: {
    secret_key: "sk_live_...",
    publishable_key: "pk_live_...",
    webhook_secret: "whsec_...", // For webhook verification
  },
});

// Runtime credentials approach
const result = await superglue.executeWorkflow({
  workflowId: "stripe-report",
  credentials: {
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
  },
});
```

### Database Connections

```typescript
// Stored credentials (connection string)
await superglue.createIntegration({
  id: "main-db",
  urlHost: "postgresql://host:5432",
  urlPath: "/production_db",
  credentials: {
    connection_string: "postgresql://user:pass@host:5432/db",
  },
});

// Runtime credentials (separate components)
const result = await superglue.executeWorkflow({
  workflowId: "db-query",
  credentials: {
    db_host: process.env.DB_HOST,
    db_user: process.env.DB_USER,
    db_password: process.env.DB_PASSWORD,
    db_name: process.env.DB_NAME,
  },
});
```

### OAuth APIs (HubSpot, Google, etc.)

```typescript
// Stored OAuth tokens
await superglue.createIntegration({
  id: "hubspot-crm",
  credentials: {
    access_token: "pat-na1-...",
    refresh_token: "refresh_token_here", // For automatic refresh
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

## Security Best Practices

<CardGroup cols={2}>
  <Card title="Credential Rotation" icon="rotate">
    **For stored credentials:**
    - Update credentials in Superglue when they rotate
    - Use webhooks to automate credential updates
    
    **For runtime credentials:**
    - Implement automatic token refresh
    - Monitor credential expiration
  </Card>
  
  <Card title="Least Privilege" icon="shield">
    **For all approaches:**
    - Only grant necessary API permissions
    - Use read-only keys when possible
    - Regularly audit credential usage
    
    ```typescript
    // Example: Read-only Stripe key for reports
    credentials: {
      stripe_secret_key: "rk_live_..." // Restricted key
    }
    ```
  </Card>
  
  <Card title="Environment Separation" icon="building">
    **Development:**
    - Use test/sandbox credentials
    - Store in Superglue for convenience
    
    **Production:**
    - Use runtime credential passing
    - Store in secure vault/environment
    
    ```typescript
    const isProduction = process.env.NODE_ENV === 'production';
    const credentials = isProduction ? 
      await vault.getCredentials() : 
      undefined; // Use stored dev credentials
    ```
  </Card>
  
  <Card title="Audit & Monitoring" icon="eye">
    **Track credential usage:**
    - Log all API calls (without credentials)
    - Monitor for unusual access patterns
    - Set up alerts for failed authentications
    
    ```typescript
    const result = await superglue.executeWorkflow({
      workflowId: "audit-workflow",
      credentials,
      options: {
        trackUsage: true,
        userId: currentUser.id
      }
    });
    ```
  </Card>
</CardGroup>

## Choosing the Right Approach

<Tabs>
  <Tab title="Development & Prototyping">
    **Use Superglue-managed credentials:**
    
    ✅ Faster setup and iteration  
    ✅ No credential management complexity  
    ✅ Easy testing across team members  
    ✅ Built-in credential validation  
    
    ```typescript
    // Simple development setup
    await superglue.buildAndExecuteWorkflow({
      instruction: "Test Stripe integration",
      integrationIds: ["stripe-dev"] // Uses stored test credentials
    });
    ```
  </Tab>
  
  <Tab title="Production & Enterprise">
    **Use runtime credential passing:**
    
    ✅ Maximum security control  
    ✅ Compliance with security policies  
    ✅ Full audit trail  
    ✅ Integration with existing credential systems  
    
    ```typescript
    // Production setup with vault integration
    const credentials = await vault.getCredentials(userId);
    await superglue.executeWorkflow({
      workflowId: savedWorkflow.id,
      credentials
    });
    ```
  </Tab>
  
  <Tab title="Hybrid Approach">
    **Use both approaches strategically:**
    
    ```typescript
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const executionOptions = {
      instruction: "Sync customer data",
      integrationIds: ["stripe", "hubspot"]
    };
    
    if (isDevelopment) {
      // Use stored credentials for development
      await superglue.buildAndExecuteWorkflow(executionOptions);
    } else {
      // Use runtime credentials for production
      await superglue.buildAndExecuteWorkflow({
        ...executionOptions,
        credentials: await getProductionCredentials()
      });
    }
    ```
  </Tab>
</Tabs>

## Next Steps

<CardGroup cols={2}>
  <Card
    title="MCP Integration"
    href="/agent-builders/mcp-integration"
    icon="plug"
  >
    Learn how credential management works with MCP and agent frameworks
  </Card>
  <Card
    title="SDK Integration"
    href="/agent-builders/sdk-integration"
    icon="code"
  >
    See examples of credential management in custom applications
  </Card>
  <Card title="Self-Hosting" href="/guides/self-hosting" icon="server">
    Set up your own Superglue instance with full credential control
  </Card>
  <Card title="OAuth Guide" href="/guides/oauth-integrations" icon="key">
    Deep dive into OAuth integrations and token management
  </Card>
</CardGroup>

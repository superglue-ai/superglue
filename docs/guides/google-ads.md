---
title: "Google Ads Integration"
description: "Set up OAuth authentication and fetch campaign data from Google Ads using superglue"
---

Integrating with Google Ads requires navigating complex authentication requirements, multiple account types, and developer tokens. superglue simplifies this process by handling OAuth flows, managing credentials, and providing a natural language interface to access your Google Ads data.

This guide demonstrates how to:

1. Set up required Google Ads accounts (Test and Manager accounts)
2. Obtain a developer token from a production account
3. Configure OAuth authentication for your Google Ads integration in superglue
4. Fetch campaign data using superglue

> **Note:** Google Ads has a very complex setup process involving test accounts, manager accounts, and developer tokens. We've done our best to summarize the process here, but refer to [Google Ads API documentation](https://developers.google.com/google-ads/api/docs/start) for more detailed information.

## Prerequisites

- A Google account for creating Google Ads accounts
- Access to Google Cloud Console (for OAuth client setup)
- superglue installed and configured (see [Quick Start](/introduction#quick-start) or [app.superglue.cloud](https://app.superglue.cloud))

## Account Setup

### 1. Create a Test Manager Account (MCC)

Start by creating a test environment to avoid billing requirements:

1. Visit the [Google Ads Test Manager Account creation page](https://ads.google.com/intl/en_us/home/tools/manager-accounts/)
2. Select "Create a test manager account" option
3. Complete the setup process - no payment details required

### 2. Create Test Google Ads Accounts

Within your test manager account:

1. Navigate to **Accounts** in the dashboard
2. Click **Create new account**
3. Select **Create test account**
4. Note the Account ID (format: XXX-XXX-XXXX)

### 3. Obtain a Developer Token

You'll need a live production Manager Account to get a developer token:

1. Create a [production Google Ads Manager Account](https://ads.google.com/intl/en_us/home/tools/manager-accounts/)
2. Navigate to **Admin** → **API Center**
3. Apply for a developer token
4. Once approved, copy your developer token

> **Note:** The developer token from your production account can access test accounts created under the same Google account.


### 4. Create OAuth Credentials

In Google Cloud Console:

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application** as the application type
4. Add authorized redirect URI: `https://app.superglue.cloud/api/auth/callback`
5. Add these scopes to your OAuth consent screen:
   ```
   https://www.googleapis.com/auth/adwords
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```
6. Save and copy your **Client ID** and **Client Secret**

## Setting Up a Google Ads integration with OAuth in Superglue

Follow the same OAuth setup process shown in the [Instagram Business guide](/docs/guides/instagram-business) or see the general [OAuth integrations guide](/docs/guides/oauth-integrations):

> **Important:** After connecting via OAuth, you'll need to add additional credentials in the **Advanced Settings**:
> - Add your production account's `developer_token` to the credentials
> - Add your test manager account ID as `login-customer-id` to enable accessing test accounts

## Fetching Campaign Data

Once authenticated, you can fetch your Google Ads campaign data:

```typescript
import { SuperglueClient } from "@superglue/client";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Schema for Google Ads campaigns
const campaignSchema = z.object({
  campaigns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      budget_amount: z.number().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      impressions: z.number().optional(),
      clicks: z.number().optional(),
      cost: z.number().optional()
    })
  ).describe("All campaigns from the Google Ads account")
});

const superglue = new SuperglueClient({
  apiKey: "YOUR_SUPERGLUE_API_KEY"
});

async function fetchGoogleAdsCampaigns() {
  const workflow = await superglue.buildWorkflow({
    instruction: "Fetch all campaigns from my Google Ads test account 410-777-4758.",
    payload: {},
    integrationIds: ["google_ads"],
    responseSchema: zodToJsonSchema(campaignSchema)
  });

  const result = await superglue.executeWorkflow({
    workflow: workflow
  });

  if (result.success) {
    console.log("Campaigns fetched:", result.data);
    console.log(`Found ${result.data.campaigns.length} campaigns`);
    
    // Example output:
    // {
    //   "campaigns": [
    //     {
    //       "id": "1234567890",
    //       "name": "Summer Sale Campaign",
    //       "status": "ENABLED",
    //       "budget_amount": 1000.00,
    //       "impressions": 45231,
    //       "clicks": 1823
    //     }
    //   ]
    // }
  } else {
    console.error("Error:", result.error);
  }
}

fetchGoogleAdsCampaigns();
```

## Working with Google Ads Query Language (GAQL)

Google Ads uses GAQL for complex queries. You can either provide the exact query or ask superglue to generate it:

```typescript
const instruction = `
  Query Google Ads to get campaign performance data for the last 30 days.
  Include campaign id, name, impressions, clicks, and cost.
  Account ID: 410-777-4758
`;

// Or with explicit GAQL:
const instructionWithGAQL = `
  Use this GAQL query: SELECT campaign.id, campaign.name, metrics.impressions, 
  metrics.clicks, metrics.cost_micros FROM campaign 
  WHERE segments.date DURING LAST_30_DAYS
  Account ID: 410-777-4758
`;
```

Superglue handles the API navigation and authentication automatically when given proper instructions.

> **Note:** To access production Google Ads accounts (not test accounts), ensure your developer token has been approved for production use. Test accounts are perfect for development and don't require billing information.

## Troubleshooting

### "Invalid developer token"
- Ensure your developer token is from an approved production Manager Account
- Verify the token is correctly passed in the credentials

### "Customer not found"
- Check that the account ID format is correct (XXX-XXX-XXXX)
- Ensure the account exists under your manager account
- Verify the login-customer-id header is set correctly

### OAuth errors
- Confirm all required scopes are included
- Check that the OAuth app has access to Google Ads API
- Try re-authenticating by clicking "Connect with OAuth" again

### Invalid Arguments
- The workflow contains invalid GAQL
- Provide more explicit instructions
- Provide few shot GAQL examples

## Next Steps

- Sign up for [superglue](https://app.superglue.cloud) to start building integrations
- Explore [MCP (Model Context Protocol)](/docs/mcp/mcp-guide) for AI-powered workflow creation
- Check out the [Instagram Business guide](/docs/guides/instagram-business) for another OAuth integration example
- Build workflows to sync campaign data with your data warehouse using GAQL queries
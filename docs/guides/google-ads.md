---
title: "Google Ads OAuth Integration"
description: "Set up OAuth authentication and fetch campaign data from Google Ads using Superglue"
---

Integrating with Google Ads requires navigating complex authentication requirements, multiple account types, and developer tokens. Superglue simplifies this process by handling OAuth flows, managing credentials, and providing a unified interface to access your Google Ads data.

This guide demonstrates how to:

1. Set up the required Google Ads accounts (Manager and Test accounts)
2. Configure OAuth authentication in Superglue
3. Fetch campaign data using workflows

> **Note:** This guide uses test accounts to avoid billing requirements during development. The same process works for production accounts with a valid developer token.

## Prerequisites

- A Google account for creating Google Ads accounts
- Access to Google Cloud Console (for OAuth credentials)
- Superglue SDK installed and configured (see [Quick Start](/introduction#quick-start))

## Google Ads Account Setup

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

You'll need a production Manager Account to get a developer token:

1. Create a [production Google Ads Manager Account](https://ads.google.com/intl/en_us/home/tools/manager-accounts/)
2. Navigate to **Admin** → **API Center**
3. Apply for a developer token
4. Once approved, copy your developer token

> **Note:** The developer token from your production account can access test accounts created under the same Google account.

## Installation

Install the required dependencies:

```bash
npm install @superglue/client zod zod-to-json-schema
```

## Setting Up OAuth in Superglue

### 1. Configure the Integration

Navigate to the Integrations page in Superglue and create a new integration:

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/google-ads-setup.mp4" />

Fill in the following configuration:

```json
{
  "id": "google_ads",
  "name": "Google Ads",
  "urlHost": "https://googleads.googleapis.com/v20",
  "documentationUrl": "https://developers.google.com/apis-explorer",
  "authentication": "OAUTH"
}
```

### 2. Add OAuth Credentials

In the OAuth section, provide:

- **Client ID**: `592234420615-q5fu0s8o4usupqnm8p7al0ns568sgj0a.apps.googleusercontent.com`
- **Client Secret**: (obtain from Google Cloud Console or use the provided one)

### 3. Configure Scopes

Click on **Advanced Settings** and add these scopes (space-separated):

```
https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/adwords
```

### 4. Special Instructions

Add this instruction to handle Google Ads' specific requirements:

```
If customer IDs are provided, add the ID to the urlPath. If manager IDs are provided and you are accessing data within a manager scope, add a login-customer-id header.
```

### 5. Connect via OAuth

Click **Connect with OAuth** to:
1. Redirect to Google's authentication page
2. Approve the requested scopes
3. Return to Superglue with tokens populated

## Fetching Campaign Data

Once authenticated, you can fetch campaign data using workflows:

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
  )
});

const superglue = new SuperglueClient({
  apiKey: "YOUR_SUPERGLUE_API_KEY"
});

async function fetchGoogleAdsCampaigns() {
  const workflow = await superglue.buildWorkflow(
    `Fetch all campaigns from Google Ads account 410-777-4758. 
     Use developer token: XzzWAqVsewByCRESdRDXtg. 
     Add manager account ID 131-404-2125 to the request header as login-customer-id.`,
    {},
    [{
      integration: {
        id: "google_ads",
        name: "Google Ads",
        urlHost: "https://googleads.googleapis.com/v20",
        credentials: { 
          // OAuth tokens are automatically included from the integration setup
        }
      }
    }],
    zodToJsonSchema(campaignSchema)
  );

  const result = await superglue.executeWorkflow({
    workflow: workflow,
    credentials: {
      google_ads_developer_token: "XzzWAqVsewByCRESdRDXtg"
    }
  });

  if (result.success) {
    console.log("Campaigns fetched:", result.data);
  } else {
    console.error("Error:", result.error);
  }
}

fetchGoogleAdsCampaigns();
```

## Working with Google Ads Query Language (GAQL)

For more complex queries, you can use GAQL in your instructions:

```typescript
const instruction = `
  Query Google Ads using GAQL to get campaign performance data.
  Use this query: SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks 
  FROM campaign WHERE segments.date DURING LAST_30_DAYS
  Account ID: 410-777-4758, Manager ID: 131-404-2125
`;
```

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

## Security Best Practices

1. **Store credentials securely**: Never commit developer tokens or client secrets to version control
2. **Use test accounts**: Always develop and test with test accounts first
3. **Limit access**: Only grant the minimum required scopes
4. **Rotate tokens**: Periodically refresh OAuth tokens and developer tokens
5. **Monitor usage**: Check API usage in Google Ads API Center

## Next Steps

- Explore [Google Ads API documentation](https://developers.google.com/google-ads/api/docs/start)
- Learn about [GAQL syntax](https://developers.google.com/google-ads/api/docs/query/overview)
- Build workflows to sync campaign data with your data warehouse
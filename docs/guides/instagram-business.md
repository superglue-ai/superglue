---
title: "Instagram Business Account Integration"
description: "Retrieve posts and insights from Instagram Business accounts using Facebook's Graph API"
---

Accessing Instagram Business account data involves navigating Meta's complex ecosystem of APIs, OAuth flows, and account linking requirements. superglue streamlines this process by providing a natural language interface you can use to fetch your Instagram business data through Facebook's Graph API.

This guide demonstrates how to:

1. Set up required Instagram Business and Facebook accounts
2. Create a Meta developer app with required permissions
3. Configure OAuth authentication for your instagram integration in superglue
4. Retrieve Instagram posts and metadata using superglue

> **Note:** This guide uses Facebook's Graph API instead of Instagram's Basic Display API, as it provides more functionality for business accounts including insights, comments, and publishing capabilities. Using the Graph API unfortunately requires a LOT of setup. We have done our best to summarize this process here, but refer readers to [Meta for Developers](https://developers.facebook.com/) for more detailed information.

## Prerequisites

- An Instagram account (will be converted to Business)
- A Facebook account to link with Instagram
- Access to [Meta for Developers](https://developers.facebook.com/)
- superglue installed and configured (see [Quick Start](/introduction#quick-start) or [app.superglue.cloud](app.superglue.cloud))

## Account Setup

### 1. Create an Instagram Business Account

Convert your Instagram account to a Business account:

1. Open Instagram (mobile app or web)
2. Go to **Settings** → **Account**
3. Select **Switch to Professional Account**
4. Choose **Business** (not Creator)
5. Complete the setup process

### 2. Link to a Facebook Page

Instagram Business accounts must be linked to a Facebook Page:

1. Create a Facebook Page if you don't have one
2. In Instagram settings, go to **Business** → **Page**
3. Select **Connect a Facebook Page**
4. Choose or create a page to link

### 3. Create a Meta Developer App

Set up your app in Meta's developer portal:

1. Visit [Meta for Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Other** as the use case
4. Choose **Business** as the app type
5. Fill in the app details and create

### 4. Configure App Products

Add required products to your app:

1. In your app dashboard, go to **Add Product**
2. Add **Facebook Login for Business**
3. Under **Facebook Login for Business** → **Settings**:
   - Add `https://app.superglue.cloud/api/auth/callback` to Valid OAuth Redirect URIs
4. In **Settings** → **Basic**:
   - Add `app.superglue.cloud` to App Domains
   - Set **App Mode** to **Live** (requires adding a privacy policy URL)

### 5. Register Test Users

For development, register your Instagram account as a test user:

1. Go to **Roles** → **Test Users** in your app dashboard
2. Add your Instagram account email
3. Accept the invitation in Instagram:
   - Go to Instagram web → **Settings** → **Apps and Websites**
   - Accept the test user invitation

## Setting Up an Instagram integration with OAuth in Superglue

<video autoPlay muted loop playsInline className="w-full aspect-video" src="https://superglue.cloud/files/instagram-setup.mp4" />
```
> **Note:** The Meta Graph API does not fully follow the OAuth 2.0 standards. It provides a long-lived access token without a refresh token that needs to be manually refreshed every 60 days. superglue will flag this, but any Meta integrations will need to be reauthenticated every 60 days.

## Retrieving Instagram Posts

Once authenticated, you can fetch Instagram business account data:

```typescript
import { SuperglueClient } from "@superglue/client";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Schema for Instagram posts
const instagramSchema = z.object({
  account: z.object({
    id: z.string(),
    username: z.string(),
    followers_count: z.number().optional(),
    media_count: z.number().optional()
  }),
  posts: z.array(
    z.object({
      id: z.string(),
      caption: z.string().optional(),
      media_type: z.string(),
      media_url: z.string(),
      permalink: z.string(),
      timestamp: z.string(),
      like_count: z.number().optional(),
      comments_count: z.number().optional(),
      insights: z.object({
        impressions: z.number().optional(),
        reach: z.number().optional(),
        engagement: z.number().optional()
      }).optional()
    })
  )
});

const superglue = new SuperglueClient({
  apiKey: "YOUR_SUPERGLUE_API_KEY"
});

async function fetchInstagramData() {
  const workflow = await superglue.buildWorkflow(
    "Fetch all of my instagram business account data, including posts and relevant metadata.",
    {},
    [{
      integration: {
        id: "instagram_business",
        name: "Instagram Business",
        urlHost: "https://graph.facebook.com/v23.0"
      }
    }],
    zodToJsonSchema(instagramSchema)
  );

  const result = await superglue.executeWorkflow({
    workflow: workflow
  });

  if (result.success) {
    console.log("Instagram data fetched:", result.data);
    console.log(`Found ${result.data.posts.length} posts`);
  } else {
    console.error("Error:", result.error);
  }
}

fetchInstagramData();
```

## Advanced Queries

### Fetch Posts with Specific Fields

```typescript
const instruction = `
  Fetch my Instagram business account posts from the last 30 days.
  Include caption, media_url, permalink, timestamp, like_count, and comments_count.
  Also fetch insights for impressions and reach for each post.
`;
```

### Get Account Insights

```typescript
const insightsSchema = z.object({
  insights: z.object({
    daily_followers: z.array(z.object({
      date: z.string(),
      value: z.number()
    })),
    profile_views: z.number(),
    website_clicks: z.number(),
    reach: z.number()
  })
});

const instruction = `
  Fetch Instagram business account insights for the last 7 days.
  Include follower count changes, profile views, website clicks, and reach.
`;
```

## Working with the API Structure

The Facebook Graph API structure for accessing Instagram data follows this pattern:

1. **Get Facebook Pages**: `/me/accounts` returns linked Facebook pages
2. **Get Instagram Account**: `/{page_id}?fields=instagram_business_account` returns the Instagram account ID
3. **Get Instagram Data**: `/{instagram_account_id}/media` returns posts and content

Superglue handles this navigation automatically when given proper instructions.

## Troubleshooting

### "No Instagram Business Account found"
- Verify your Instagram account is converted to Business (not Personal or Creator)
- Check that it's properly linked to a Facebook Page
- Ensure the Facebook Page is accessible by your app

### "Insufficient permissions"
- Confirm all required scopes were approved during OAuth
- Check that your app is in Live mode
- For test users, verify the invitation was accepted in Instagram

### "Invalid OAuth token"
- Re-authenticate by clicking "Connect with OAuth" again
- Check that your app's OAuth redirect URI matches exactly
- Verify App ID and App Secret are correct

## Rate Limits and Best Practices

1. **API Limits**: Instagram applies rate limits per user and app
2. **Batch Requests**: Use field expansion to get multiple data points in one call
3. **Cache Results**: Store frequently accessed data to reduce API calls
4. **Webhook Updates**: Consider implementing webhooks for real-time updates
5. **Data Retention**: Follow Meta's data retention policies

## App Review for Production

To access data from non-test users, submit your app for review:

1. Go to **App Review** → **Permissions and Features**
2. Request the required permissions
3. Provide use case descriptions and screencasts
4. Wait for Meta's approval (typically 5-10 business days)

## Next Steps

- Explore [Instagram Graph API documentation](https://developers.facebook.com/docs/instagram-api)
- Learn about [Instagram Insights metrics](https://developers.facebook.com/docs/instagram-api/guides/insights)
- Build workflows to sync Instagram data with your analytics platform
- Set up automated posting workflows using the Content Publishing API
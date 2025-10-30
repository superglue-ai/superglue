# OAuth Integrations Guide

This guide explains how to set up OAuth authentication for your integrations in superglue.

## Overview

superglue supports OAuth 2.0 authentication for integrations, allowing secure access to APIs without storing passwords. OAuth provides:

- Secure token-based authentication
- Automatic token refresh (when refresh tokens are available)
- Granular permission scopes
- Easy revocation of access

## Setting Up OAuth

### 1. Create an OAuth App

First, create an OAuth application with your service provider:

- **GitHub**: Settings → Developer settings → OAuth Apps
- **Google Ads**: [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials (see [detailed guide](/docs/guides/google-ads))
- **Instagram/Meta**: [Meta for Developers](https://developers.facebook.com/) → Create App (see [detailed guide](/docs/guides/instagram-business))
- **Slack**: [Your Apps](https://api.slack.com/apps) → Create New App → OAuth & Permissions
- **HubSpot**: [App Dashboard](https://app.hubspot.com/apps) → Create app
- **Stripe**: [Dashboard](https://dashboard.stripe.com/) → Connect → Settings

### 2. Configure Redirect URI

When creating your OAuth app, you'll need to specify a redirect/callback URI. Use:

For superglue cloud:
```
https://app.superglue.cloud/api/auth/callback
```

For self-hosted instances:
```
https://your-domain.com/api/auth/callback
```

For local development:
```
http://localhost:3000/api/auth/callback
```

### 3. Create Integration in superglue

1. Go to the Integrations page
2. Click "Add Integration"
3. Fill in the basic configuration (ID, name, URL host)
4. Select "OAuth" as the authentication type
5. Provide your OAuth credentials:
   - **Client ID**: From your OAuth app
   - **Client Secret**: From your OAuth app

```json
{
  "client_id": "your-oauth-client-id",
  "client_secret": "your-oauth-client-secret",
  "auth_url": "https://provider.com/oauth/authorize"
}
```

**Note**: The `auth_url` is optional for known providers (GitHub, Google, Slack, etc.) as it's auto-detected.

### 4. Connect via OAuth

After saving the integration:

1. The OAuth callback URL will be displayed
2. Click "Connect with OAuth" to initiate the authentication flow
3. Authorize the application on the provider's page
4. You'll be redirected back to superglue with tokens populated

## OAuth Credential Fields

| Field | Description | Required |
|-------|-------------|----------|
| `client_id` | OAuth application client ID | Yes |
| `client_secret` | OAuth application client secret | Yes |
| `auth_url` | Authorization endpoint URL | No (auto-detected for known providers) |
| `access_token` | Current access token | No (populated after OAuth flow) |
| `refresh_token` | Token for refreshing access | No (populated if provided by provider) |
| `token_type` | Token type (usually "Bearer") | No (defaults to "Bearer") |
| `expires_at` | Token expiration timestamp | No (populated if provided) |

## Supported Providers

superglue has built-in support for these OAuth providers:

- **GitHub**: `auth_url`: `https://github.com/login/oauth/authorize`
- **Google Ads**: `auth_url`: `https://accounts.google.com/o/oauth2/v2/auth` (see [setup guide](/docs/guides/google-ads))
- **Instagram/Meta**: `auth_url`: `https://www.facebook.com/v23.0/dialog/oauth` (see [setup guide](/docs/guides/instagram-business))
- **Microsoft**: `auth_url`: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
- **Slack**: `auth_url`: `https://slack.com/oauth/v2/authorize`
- **HubSpot**: `auth_url`: `https://app.hubspot.com/oauth/authorize`
- **Stripe**: `auth_url`: `https://connect.stripe.com/oauth/authorize`

For other providers, specify the `auth_url` manually in the Advanced Settings.

## Token Refresh

superglue automatically handles token refresh when:

1. The provider supplies a `refresh_token`
2. The `expires_at` timestamp indicates the token is expired or expiring soon
3. The integration has valid `client_id` and `client_secret`

Tokens are considered expired if they expire within the next 5 minutes.

## Using OAuth in Workflows

When using an OAuth-enabled integration in workflows, the access token is automatically included in API requests. You don't need to manually add authorization headers.

## Troubleshooting

### "OAuth client credentials not configured"
Ensure you've added both `client_id` and `client_secret` to your integration's credentials.

### "Token exchange failed"
- Verify your OAuth app's redirect URI matches exactly
- Check that your client credentials are correct
- Some providers require the app to be published/approved

### Token expired
If tokens expire and refresh fails:
1. Check if the provider supplied a refresh token
2. Verify refresh token hasn't been revoked
3. Re-authenticate by clicking "Connect with OAuth" again

## Security Best Practices

1. **Never share client secrets**: Keep your `client_secret` confidential
2. **Use minimal scopes**: Only request permissions your integration needs
3. **Rotate credentials**: Periodically update client secrets
4. **Monitor access**: Review OAuth app access logs on the provider's dashboard
5. **Revoke unused tokens**: Remove integrations you're no longer using

## Example: GitHub OAuth Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
2. Fill in:
   - Application name: "superglue Integration"
   - Homepage URL: Your superglue instance URL
   - Authorization callback URL: `https://app.superglue.cloud/api/auth/callback`
3. Create the app and copy the Client ID and Client Secret
4. In superglue, create a new integration:
   - ID: `github`
   - URL Host: `https://api.github.com`
   - Credentials:
     ```json
     {
       "client_id": "your-github-client-id",
       "client_secret": "your-github-client-secret"
     }
     ```
5. Save and click "Connect with OAuth"
6. Authorize the app on GitHub
7. You're ready to use GitHub APIs in your workflows!

## Detailed Integration Guides

For complex OAuth setups with additional requirements, see our detailed guides:

- [Google Ads Integration](/docs/guides/google-ads) - Includes test account setup and developer token configuration
- [Instagram Business Integration](/docs/guides/instagram-business) - Covers Meta's app setup and Facebook page linking requirements 
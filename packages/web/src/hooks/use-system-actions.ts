import { useConfig } from "@/src/app/config-context";
import { useToast } from "@/src/hooks/use-toast";
import { createOAuthErrorHandler, triggerOAuthFlow } from "@/src/lib/oauth-utils";
import type { System } from "@superglue/shared";
import { SuperglueClient, UpsertMode } from "@superglue/shared";
import { tokenRegistry } from "../lib/token-registry";

export function useSystemActions() {
  const config = useConfig();
  const { toast } = useToast();

  // Helper function to clean system data for GraphQL input
  const cleanSystemForInput = (system: System) => {
    return {
      id: system.id,
      urlHost: system.urlHost,
      urlPath: system.urlPath,
      documentationUrl: system.documentationUrl,
      documentation: system.documentation,
      specificInstructions: system.specificInstructions,
      credentials: system.credentials,
      // Include documentationPending if it exists (for refresh docs functionality)
      ...(system.documentationPending !== undefined && {
        documentationPending: system.documentationPending,
      }),
    };
  };

  const saveSystem = async (system: System): Promise<System | null> => {
    try {
      if (system.id) {
        // Simple save - always update mode for editing existing systems
        const cleanedSystem = cleanSystemForInput(system);

        const client = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
          apiEndpoint: config.apiEndpoint,
        });
        const savedSystem = await client.upsertSystem(system.id, cleanedSystem, UpsertMode.UPDATE);

        return savedSystem; // Return the saved system with correct ID
      }
      return null;
    } catch (error) {
      console.error("Error saving system:", error);
      toast({
        title: "Error",
        description: "Failed to save system",
        variant: "destructive",
      });
      throw error; // Re-throw so the form can handle the error
    }
  };

  const handleOAuth = async (system: System) => {
    const grantType = system.credentials?.grant_type || "authorization_code";

    if (grantType === "client_credentials") {
      // For client credentials, the OAuth flow is handled automatically by the backend
      // when the system is saved. We just need to trigger a refresh by updating
      // one of the OAuth fields to force the backend to re-run the OAuth flow
      toast({
        title: "OAuth Processing",
        description:
          "Client credentials OAuth flow is being processed in the background. The system will be updated automatically.",
      });
      // Save the system to trigger the backend OAuth flow
      await saveSystem(system);
    } else {
      // For authorization code flow, use the existing popup logic
      const oauthFields = {
        access_token: system.credentials?.access_token,
        refresh_token: system.credentials?.refresh_token,
        client_id: system.credentials?.client_id,
        client_secret: system.credentials?.client_secret,
        scopes: system.credentials?.scopes,
        auth_url: system.credentials?.auth_url,
        token_url: system.credentials?.token_url,
        grant_type: grantType,
      };

      // Determine auth type dynamically (defensive programming)
      const detectAuthType = (credentials: any): "oauth" | "apikey" | "none" => {
        if (!credentials || Object.keys(credentials).length === 0) return "none";

        // Define OAuth-specific fields
        const oauthSpecificFields = [
          "client_id",
          "client_secret",
          "auth_url",
          "token_url",
          "access_token",
          "refresh_token",
          "scopes",
          "expires_at",
          "token_type",
          "grant_type",
        ];

        // Get all credential keys
        const allKeys = Object.keys(credentials);

        // Check if any OAuth-specific fields are present
        const hasOAuthFields = allKeys.some((key) => oauthSpecificFields.includes(key));

        if (hasOAuthFields) {
          // It's OAuth-related, now check the status
          const grantType = credentials.grant_type || "authorization_code";

          if (grantType === "client_credentials") {
            // For client credentials, only access_token is needed
            if (credentials.access_token) {
              return "oauth"; // Will be shown as configured
            } else if (credentials.client_id || credentials.client_secret) {
              return "oauth"; // Will be shown as pending
            } else {
              return "none"; // Only has meta fields like token_url, scopes, etc.
            }
          } else {
            // Authorization code flow - needs both access_token and refresh_token
            if (credentials.access_token && credentials.refresh_token) {
              return "oauth"; // Will be shown as configured
            } else if (credentials.client_id || credentials.client_secret) {
              return "oauth"; // Will be shown as pending
            } else {
              return "none"; // Only has meta fields like auth_url, scopes, etc.
            }
          }
        }

        // No OAuth fields present, so it's API key
        return "apikey";
      };

      const authType = detectAuthType(system.credentials || {});

      // Enhanced error handling using centralized utility
      const handleOAuthError = createOAuthErrorHandler(system.id, toast);

      // Trigger OAuth flow with error handling
      const cleanup = triggerOAuthFlow(
        system.id,
        oauthFields,
        tokenRegistry.getToken(),
        authType,
        handleOAuthError,
        true, // Force OAuth
        undefined, // templateInfo
        undefined, // onSuccess
        config.superglueEndpoint,
        undefined, // suppressErrorUI
        config.apiEndpoint,
      );

      // Store cleanup function for potential use
      if (cleanup) {
        // Cleanup will be called automatically when OAuth completes or fails
      }
    }
  };

  return {
    saveSystem,
    handleOAuth,
  };
}

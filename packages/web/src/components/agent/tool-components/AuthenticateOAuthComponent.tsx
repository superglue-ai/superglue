"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import { triggerOAuthFlow } from "@/src/lib/oauth-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { SuperglueClient, systems as templateSystems, ToolCall } from "@superglue/shared";
import { CheckCircle, Key, Loader2, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface AuthenticateOAuthComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onOAuthComplete?: (toolCallId: string, systemData: any) => void;
  onSystemMessage?: (message: string, options?: { triggerImmediateResponse?: boolean }) => void;
  onAbortStream?: () => void;
}

export function AuthenticateOAuthComponent({
  tool,
  onInputChange,
  onOAuthComplete,
  onSystemMessage,
  onAbortStream,
}: AuthenticateOAuthComponentProps) {
  const config = useConfig();
  const { refreshSystems } = useSystems();
  const [buttonState, setButtonState] = useState<"idle" | "loading" | "completed" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parse output
  const output = (() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
    } catch {
      return null;
    }
  })();

  const requiresOAuth = output?.requiresOAuth === true;
  const systemId = output?.systemId || tool.input?.systemId;
  const oauthConfig = output?.oauthConfig || {};
  const system = output?.system;

  const handleOAuthClick = useCallback(async () => {
    if (!systemId || !oauthConfig) return;

    // Stop the agent stream when user clicks action button
    onAbortStream?.();

    setButtonState("loading");
    setErrorMessage(null);

    try {
      // Detect if using superglue OAuth (has client_id but no client_secret)
      const usingSuperglueOAuth = oauthConfig.client_id && !oauthConfig.client_secret;
      let templateInfo: { templateId?: string; clientId?: string } | undefined;

      if (usingSuperglueOAuth) {
        // Check if system ID matches a template
        const template = templateSystems[systemId];
        templateInfo = {
          templateId: template ? systemId : undefined,
          clientId: oauthConfig.client_id,
        };
      }

      const handleOAuthError = (error: string) => {
        setButtonState("error");
        setErrorMessage(error);

        // Report error to agent so it can help troubleshoot
        if (onSystemMessage) {
          onSystemMessage(
            `[SYSTEM] OAuth authentication failed for "${systemId}". Error: ${error}. Help the user troubleshoot this issue.`,
            { triggerImmediateResponse: true },
          );
        }
      };

      const handleOAuthSuccess = async (tokens: any) => {
        if (tokens) {
          // Update the system with the OAuth tokens
          const client = new SuperglueClient({
            endpoint: config.superglueEndpoint,
            apiKey: tokenRegistry.getToken(),
          });

          try {
            // Get current system and update credentials
            const currentSystem = await client.getSystem(systemId);
            const updatedCredentials = {
              ...currentSystem?.credentials,
              // Save OAuth config (client_id, client_secret, URLs) so they persist for token refresh
              ...(oauthConfig.client_id && { client_id: oauthConfig.client_id }),
              ...(oauthConfig.client_secret && { client_secret: oauthConfig.client_secret }),
              ...(oauthConfig.auth_url && { auth_url: oauthConfig.auth_url }),
              ...(oauthConfig.token_url && { token_url: oauthConfig.token_url }),
              ...(oauthConfig.scopes && { scopes: oauthConfig.scopes }),
              ...(oauthConfig.grant_type && { grant_type: oauthConfig.grant_type }),
              // Save the tokens
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              token_type: tokens.token_type,
              expires_at: tokens.expires_at,
            };

            // Save updated system - only pass allowed fields
            await client.upsertSystem(systemId, {
              credentials: updatedCredentials,
            });

            setButtonState("completed");
            refreshSystems();

            if (onSystemMessage) {
              onSystemMessage(
                `[SYSTEM] OAuth authentication for "${systemId}" completed successfully. Access token saved. Inform the user that authentication is complete and the system is ready to use, suggest to test it.`,
                { triggerImmediateResponse: true },
              );
            }
          } catch (error: any) {
            handleOAuthError(`Failed to save tokens: ${error.message}`);
          }
        }
      };

      // Trigger OAuth flow
      triggerOAuthFlow(
        systemId,
        {
          client_id: oauthConfig.client_id,
          client_secret: oauthConfig.client_secret,
          auth_url: oauthConfig.auth_url,
          token_url: oauthConfig.token_url,
          scopes: oauthConfig.scopes,
          grant_type: oauthConfig.grant_type || "authorization_code",
        },
        tokenRegistry.getToken(), // apiKey
        "oauth", // authType
        handleOAuthError,
        true, // forceOAuth
        templateInfo,
        handleOAuthSuccess,
        config.superglueEndpoint,
      );
    } catch (error: any) {
      setButtonState("error");
      setErrorMessage(error.message);
    }
  }, [
    systemId,
    oauthConfig,
    config.superglueEndpoint,
    onOAuthComplete,
    onSystemMessage,
    onAbortStream,
    tool.id,
    refreshSystems,
  ]);

  // Render states
  if (tool.status === "running" || tool.status === "pending") {
    return (
      <ToolCallWrapper tool={tool} openByDefault={true}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Preparing OAuth authentication...
        </div>
      </ToolCallWrapper>
    );
  }

  // Show error only for actual failures (not requiresOAuth state)
  if (output?.success === false && !requiresOAuth) {
    return (
      <ToolCallWrapper tool={tool} openByDefault={true}>
        <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-200/60 dark:border-red-900/40">
          <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-red-700 dark:text-red-300">
              OAuth Setup Failed
            </div>
            <div className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">{output?.error}</div>
          </div>
        </div>
      </ToolCallWrapper>
    );
  }

  return (
    <ToolCallWrapper tool={tool} openByDefault={true}>
      <div className="space-y-4">
        {/* System info */}
        {system && (
          <div className="text-sm">
            <span className="text-muted-foreground">System: </span>
            <span className="font-medium">{system.name || systemId}</span>
            {system.urlHost && (
              <span className="text-muted-foreground ml-2">({system.urlHost})</span>
            )}
          </div>
        )}

        {/* OAuth scopes if provided */}
        {oauthConfig.scopes && (
          <div className="text-sm">
            <span className="text-muted-foreground">Scopes: </span>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{oauthConfig.scopes}</code>
          </div>
        )}

        {/* OAuth button */}
        {requiresOAuth && buttonState !== "completed" && (
          <Button onClick={handleOAuthClick} disabled={buttonState === "loading"} className="gap-2">
            {buttonState === "loading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                Authenticate with OAuth
              </>
            )}
          </Button>
        )}

        {/* Success state */}
        {buttonState === "completed" && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            OAuth authentication completed
          </div>
        )}

        {/* Error state */}
        {errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-200/60 dark:border-red-900/40">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
            <div className="text-sm text-red-600/80 dark:text-red-400/80">{errorMessage}</div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}

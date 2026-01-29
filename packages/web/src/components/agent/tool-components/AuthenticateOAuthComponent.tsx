"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import { UserAction } from "@/src/lib/agent/agent-types";
import { triggerOAuthFlow } from "@/src/lib/oauth-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import {
  SuperglueClient,
  systems as templateSystems,
  findTemplateForSystem,
  ToolCall,
} from "@superglue/shared";
import { CheckCircle, Key, Loader2, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface AuthenticateOAuthComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  onAbortStream?: () => void;
}

export function AuthenticateOAuthComponent({
  tool,
  onInputChange,
  sendAgentRequest,
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
      // Determine if we should use template OAuth or user-provided/stored credentials
      // Priority: user input > stored system credentials > template
      // If oauthConfig has client_secret, it means either:
      //   1. User provided it in tool input, OR
      //   2. System has it stored in credentials
      // In both cases, we should cache and use those credentials, not template
      const hasClientSecret = !!oauthConfig.client_secret;

      let templateInfo: { templateId?: string; clientId?: string } | undefined;

      // Only use template OAuth if we don't have client_secret (neither from user input nor stored)
      if (!hasClientSecret) {
        const templateMatch = findTemplateForSystem(system || { id: systemId });
        const templateOAuth = templateMatch?.template?.oauth;
        const hasTemplateClientId = !!(
          templateOAuth?.client_id && String(templateOAuth.client_id).trim().length > 0
        );

        if (hasTemplateClientId && templateOAuth) {
          templateInfo = {
            templateId: templateMatch.key,
            clientId: templateOAuth.client_id,
          };
        }
      }

      const handleOAuthError = (error: string) => {
        setButtonState("error");
        setErrorMessage(error);
        sendAgentRequest?.(undefined, {
          userActions: [
            {
              type: "tool_execution_feedback",
              toolCallId: tool.id,
              toolName: "authenticate_oauth",
              feedback: "oauth_failure",
              data: { systemId, error },
            },
          ],
        });
      };

      const handleOAuthSuccess = async (tokens: any) => {
        if (tokens) {
          const client = new SuperglueClient({
            endpoint: config.superglueEndpoint,
            apiKey: tokenRegistry.getToken(),
            apiEndpoint: config.apiEndpoint,
          });

          try {
            const currentSystem = await client.getSystem(systemId);
            const updatedCredentials = {
              ...currentSystem?.credentials,
              ...(oauthConfig.client_id && { client_id: oauthConfig.client_id }),
              ...(oauthConfig.client_secret && { client_secret: oauthConfig.client_secret }),
              ...(oauthConfig.auth_url && { auth_url: oauthConfig.auth_url }),
              ...(oauthConfig.token_url && { token_url: oauthConfig.token_url }),
              ...(oauthConfig.scopes && { scopes: oauthConfig.scopes }),
              ...(oauthConfig.grant_type && { grant_type: oauthConfig.grant_type }),
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              token_type: tokens.token_type,
              expires_at: tokens.expires_at,
              ...(tokens.tokenAuthMethod && { tokenAuthMethod: tokens.tokenAuthMethod }),
              ...(tokens.tokenContentType && { tokenContentType: tokens.tokenContentType }),
              ...(tokens.extraHeaders && {
                extraHeaders:
                  typeof tokens.extraHeaders === "string"
                    ? tokens.extraHeaders
                    : JSON.stringify(tokens.extraHeaders),
              }),
            };

            await client.upsertSystem(systemId, {
              credentials: updatedCredentials,
            });

            setButtonState("completed");
            refreshSystems();
            sendAgentRequest?.(undefined, {
              userActions: [
                {
                  type: "tool_execution_feedback",
                  toolCallId: tool.id,
                  toolName: "authenticate_oauth",
                  feedback: "oauth_success",
                  data: { systemId },
                },
              ],
            });
          } catch (error: any) {
            handleOAuthError(`Failed to save tokens: ${error.message}`);
          }
        }
      };

      // Trigger OAuth flow
      // If templateInfo is set, backend will resolve credentials from template
      // If user explicitly provided client_secret, it will be in oauthConfig and will be cached
      // oauthConfig.client_secret will be undefined if user didn't explicitly provide it
      triggerOAuthFlow(
        systemId,
        {
          client_id: oauthConfig.client_id,
          client_secret: oauthConfig.client_secret, // Will be undefined if user didn't provide it
          auth_url: oauthConfig.auth_url,
          token_url: oauthConfig.token_url,
          scopes: oauthConfig.scopes,
          grant_type: oauthConfig.grant_type || "authorization_code",
          tokenAuthMethod: oauthConfig.tokenAuthMethod,
          tokenContentType: oauthConfig.tokenContentType,
          usePKCE: oauthConfig.usePKCE,
          extraHeaders: oauthConfig.extraHeaders,
        },
        tokenRegistry.getToken(), // apiKey
        "oauth", // authType
        handleOAuthError,
        true, // forceOAuth
        templateInfo,
        handleOAuthSuccess,
        config.superglueEndpoint,
        undefined, // suppressErrorUI
        config.apiEndpoint,
      );
    } catch (error: any) {
      setButtonState("error");
      setErrorMessage(error.message);
    }
  }, [
    systemId,
    oauthConfig,
    config.superglueEndpoint,
    config.apiEndpoint,
    onAbortStream,
    tool.id,
    refreshSystems,
    sendAgentRequest,
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
    <ToolCallWrapper tool={tool} openByDefault={buttonState !== "completed"}>
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

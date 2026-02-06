"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import { UserAction } from "@/src/lib/agent/agent-types";
import { triggerOAuthFlow } from "@/src/lib/oauth-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { findTemplateForSystem, ToolCall } from "@superglue/shared";
import { AlertCircle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

  const isToolExecuting = tool.status === "running" || tool.status === "pending";
  const isOAuthCompleted = buttonState === "completed";
  const isOAuthFailed = buttonState === "error";

  const sendOAuthFailureEvent = useCallback(
    (error: string) => {
      sendAgentRequest?.(undefined, {
        userActions: [
          {
            type: "tool_event",
            toolCallId: tool.id,
            toolName: "authenticate_oauth",
            event: "oauth_failure",
            payload: { systemId, error },
          },
        ],
      });
    },
    [sendAgentRequest, tool.id, systemId],
  );

  const hasInitialFailure = output?.success === false && !requiresOAuth;
  const initialFailureSentRef = useRef(false);

  useEffect(() => {
    if (hasInitialFailure && !initialFailureSentRef.current && output?.error) {
      initialFailureSentRef.current = true;
      sendOAuthFailureEvent(output.error);
    }
  }, [hasInitialFailure, output?.error, sendOAuthFailureEvent]);

  const handleOAuthClick = useCallback(async () => {
    if (!systemId || !oauthConfig) return;

    setButtonState("loading");
    setErrorMessage(null);

    try {
      let templateInfo: { templateId?: string; clientId?: string } | undefined;
      const hasClientSecret = !!oauthConfig.client_secret;

      if (!hasClientSecret) {
        // Check if system matches a template with OAuth configured
        const templateMatch = system ? findTemplateForSystem(system) : null;
        const template = templateMatch?.template || templateSystems[systemId];
        const templateOAuth = template?.oauth;
        const hasTemplateClientId = !!(
          templateOAuth?.client_id && String(templateOAuth.client_id).trim().length > 0
        );

        if (hasTemplateClientId && templateMatch) {
          // Use template OAuth if the template has a client_id configured
          templateInfo = {
            templateId: templateMatch.key,
            clientId: templateOAuth.client_id,
          };
        } else if (hasTemplateClientId) {
          // Fallback: use systemId if it matches a template directly
          templateInfo = {
            templateId: systemId,
            clientId: templateOAuth.client_id,
          };
        }
      }

      const handleOAuthError = (error: string) => {
        setButtonState("error");
        setErrorMessage(error);
        sendOAuthFailureEvent(error);
      };

      const handleOAuthSuccess = async (tokens: any) => {
        if (tokens) {
          setButtonState("completed");
          refreshSystems();
          sendAgentRequest?.(undefined, {
            userActions: [
              {
                type: "tool_event",
                toolCallId: tool.id,
                toolName: "authenticate_oauth",
                event: "oauth_success",
                payload: { systemId, tokens },
              },
            ],
          });
        }
      };

      triggerOAuthFlow(
        systemId,
        {
          client_id: oauthConfig.client_id,
          client_secret: oauthConfig.client_secret,
          auth_url: oauthConfig.auth_url,
          token_url: oauthConfig.token_url,
          scopes: oauthConfig.scopes,
          grant_type: oauthConfig.grant_type || "authorization_code",
          tokenAuthMethod: oauthConfig.tokenAuthMethod,
          tokenContentType: oauthConfig.tokenContentType,
          usePKCE: oauthConfig.usePKCE,
          extraHeaders: oauthConfig.extraHeaders,
        },
        tokenRegistry.getToken(),
        "oauth",
        handleOAuthError,
        true,
        templateInfo,
        handleOAuthSuccess,
        config.superglueEndpoint,
        undefined,
        config.apiEndpoint,
      );
    } catch (error: any) {
      setButtonState("error");
      setErrorMessage(error.message);
    }
  }, [
    systemId,
    oauthConfig,
    system,
    config.superglueEndpoint,
    config.apiEndpoint,
    tool.id,
    refreshSystems,
    sendAgentRequest,
    sendOAuthFailureEvent,
  ]);

  if (isToolExecuting) {
    return (
      <ToolCallWrapper tool={tool} openByDefault={true}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Preparing OAuth authentication...
        </div>
      </ToolCallWrapper>
    );
  }

  if (output?.success === false && !requiresOAuth) {
    return (
      <ToolCallWrapper tool={tool} openByDefault={true} statusOverride="error">
        <div className="border border-red-200/40 dark:border-red-700/40 p-3 rounded-md flex items-start gap-2 overflow-hidden">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
              OAuth Setup Failed
            </div>
            <div className="text-sm text-red-800 dark:text-red-200 break-words max-h-40 overflow-y-auto">
              {output?.error}
            </div>
          </div>
        </div>
      </ToolCallWrapper>
    );
  }

  const wrapperStatusOverride = isOAuthCompleted
    ? "completed"
    : isOAuthFailed
      ? "error"
      : undefined;

  return (
    <ToolCallWrapper
      tool={tool}
      openByDefault={!isOAuthCompleted}
      statusOverride={wrapperStatusOverride}
    >
      <div className="space-y-4">
        {system && (
          <div className="text-sm">
            <span className="text-muted-foreground">System: </span>
            <span className="font-medium">{system.name || systemId}</span>
            {system.urlHost && (
              <span className="text-muted-foreground ml-2">({system.urlHost})</span>
            )}
          </div>
        )}

        {requiresOAuth && !isOAuthFailed && (
          <OAuthConnectButton
            system={system || { id: systemId }}
            onClick={handleOAuthClick}
            disabled={buttonState === "loading"}
            loading={buttonState === "loading"}
            connected={isOAuthCompleted}
          />
        )}

        {errorMessage && (
          <div className="border border-red-200/40 dark:border-red-700/40 p-3 rounded-md flex items-start gap-2 overflow-hidden">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 dark:text-red-200 break-words max-h-40 overflow-y-auto min-w-0">
              {errorMessage}
            </div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}

"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { ErrorMessage } from "@/src/components/ui/error-message";
import { OAuthConnectButton } from "@/src/components/ui/oauth-connect-button";
import { UserAction } from "@/src/lib/agent/agent-types";
import { triggerOAuthFlow } from "@/src/lib/oauth-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { findTemplateForSystem, SuperglueClient, ToolCall } from "@superglue/shared";
import { Loader2 } from "lucide-react";
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
      let resolvedClientSecret: string | undefined;

      const client = new SuperglueClient({
        endpoint: config.apiEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });
      const freshSystem = await client.getSystem(systemId);
      resolvedClientSecret = freshSystem?.credentials?.client_secret;

      if (!resolvedClientSecret) {
        const templateMatch = findTemplateForSystem(system || { id: systemId, name: systemId });
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
          client_secret: resolvedClientSecret,
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
        config.apiEndpoint,
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
    config.apiEndpoint,
    config.apiEndpoint,
    tool.id,
    refreshSystems,
    sendAgentRequest,
    sendOAuthFailureEvent,
  ]);

  if (isToolExecuting) {
    return (
      <ToolCallWrapper tool={tool} openByDefault={true} statusOverride="running">
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
        <ErrorMessage title="OAuth Setup Failed" message={output?.error || "Unknown error"} />
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
            {system.url && <span className="text-muted-foreground ml-2">({system.url})</span>}
          </div>
        )}

        {requiresOAuth && !isOAuthFailed && (
          <OAuthConnectButton
            system={system || { id: systemId, name: systemId }}
            onClick={handleOAuthClick}
            disabled={buttonState === "loading"}
            loading={buttonState === "loading"}
            connected={isOAuthCompleted}
          />
        )}

        {errorMessage && <ErrorMessage message={errorMessage} />}
      </div>
    </ToolCallWrapper>
  );
}

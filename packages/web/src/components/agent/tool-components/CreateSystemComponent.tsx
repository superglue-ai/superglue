"use client";

import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useToast } from "@/src/hooks/use-toast";
import { useSystemActions } from "@/src/hooks/use-system-actions";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { System, SystemInput, ToolCall } from "@superglue/shared";
import { UserAction } from "@/src/lib/agent/agent-types";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Globe,
  Key,
  KeyRound,
  Loader2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface CreateSystemComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  onAbortStream?: () => void;
}

type CreateSystemInput = SystemInput & { sensitiveCredentials?: Record<string, boolean> };

interface CreateSystemOutput {
  success?: boolean;
  confirmationState?: string;
  systemConfig?: any;
  requiredSensitiveFields?: string[];
  system?: System;
}

function CreateSystemComponentImpl({
  tool,
  onInputChange,
  onToolUpdate,
  sendAgentRequest,
  onAbortStream,
}: CreateSystemComponentProps) {
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(false);
  const [systemNotFound, setSystemNotFound] = useState(false);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const { saveSystem, handleOAuth } = useSystemActions();
  const { toast } = useToast();
  const { systems, refreshSystems, isRefreshing } = useSystems();

  const getAuthBadge = useCallback((credentials: Record<string, any>) => {
    if (!credentials || Object.keys(credentials).length === 0) {
      return { color: "amber", label: "No Auth", icon: "clock" };
    }

    const keys = Object.keys(credentials);
    if (keys.includes("client_id") && keys.includes("client_secret")) {
      return { color: "blue", label: "OAuth", icon: "key" };
    }
    if (keys.includes("api_key") || keys.includes("apiKey") || keys.includes("token")) {
      return { color: "green", label: "API Key", icon: "key" };
    }
    if (keys.includes("username") && keys.includes("password")) {
      return { color: "green", label: "Basic Auth", icon: "key" };
    }
    if (keys.includes("bearer") || keys.includes("access_token")) {
      return { color: "green", label: "Bearer Token", icon: "key" };
    }

    return { color: "green", label: "Custom Auth", icon: "key" };
  }, []);

  const input = (() => {
    if (!tool.input) return null;
    try {
      return typeof tool.input === "string"
        ? JSON.parse(tool.input)
        : (tool.input as CreateSystemInput);
    } catch {
      return null;
    }
  })();

  const output = (() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string"
        ? JSON.parse(tool.output)
        : (tool.output as CreateSystemOutput);
    } catch {
      return null;
    }
  })();

  const requiredSensitiveFields = useMemo(() => {
    if (output?.requiredSensitiveFields && output.requiredSensitiveFields.length > 0) {
      return output.requiredSensitiveFields;
    }
    if (input?.sensitiveCredentials) {
      return Object.keys(input.sensitiveCredentials);
    }
    return [];
  }, [output?.requiredSensitiveFields, input?.sensitiveCredentials]);

  const hasSensitiveCredentials = requiredSensitiveFields.length > 0;
  const isAwaitingConfirmation = tool.status === "awaiting_confirmation" && hasSensitiveCredentials;
  const isConfirming = tool.status === "running" && hasSensitiveCredentials;
  const isCompleted = tool.status === "completed" && output?.success;
  const isToolInProgress = tool.status === "running" || tool.status === "pending";
  const showPendingMessage = isToolInProgress && !isCompleted && !hasSensitiveCredentials;

  const systemConfig = output?.systemConfig || input;

  const systemId = output?.system?.id || systemConfig?.id || input?.id;
  const systemName = output?.system?.name || systemConfig?.name || input?.name;
  const systemFromContext = useMemo(() => {
    if (systemId) return systems.find((i) => i.id === systemId) || null;
    if (systemName) return systems.find((i) => i.name === systemName) || null;
    return null;
  }, [systems, systemId, systemName]);

  const displaySystem = systemFromContext || output?.system || systemConfig || input;

  const badge = useMemo(
    () => getAuthBadge(displaySystem?.credentials || {}),
    [displaySystem?.credentials, getAuthBadge],
  );
  const colorClasses = useMemo(
    () => ({
      blue: "text-blue-800 dark:text-blue-300 bg-blue-500/10",
      amber: "text-amber-800 dark:text-amber-300 bg-amber-500/10",
      green: "text-green-800 dark:text-green-300 bg-green-500/10",
    }),
    [],
  );

  const hasTriggeredRefreshRef = useRef(false);
  useEffect(() => {
    if (isCompleted && systemId && !hasTriggeredRefreshRef.current) {
      hasTriggeredRefreshRef.current = true;
      refreshSystems();
    }
  }, [isCompleted, systemId, refreshSystems]);

  useEffect(() => {
    if (isCompleted || tool.status === "declined" || tool.status === "error") {
      setIsExecuting(false);
    }
  }, [isCompleted, tool.status]);

  const wasFoundInContextRef = useRef(false);
  useEffect(() => {
    if (systemFromContext) {
      wasFoundInContextRef.current = true;
      setSystemNotFound(false);
    } else if (wasFoundInContextRef.current && !isRefreshing) {
      setSystemNotFound(true);
    }
  }, [systemFromContext, isRefreshing]);

  const handleConfirm = useCallback(() => {
    if (!sendAgentRequest) return;

    setIsExecuting(true);
    onToolUpdate?.(tool.id, { status: "running" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_event",
          toolCallId: tool.id,
          toolName: "create_system",
          event: "confirmed",
          payload: {
            systemConfig,
            userProvidedCredentials: credentialValues,
          },
        },
      ],
    });
  }, [sendAgentRequest, onToolUpdate, tool.id, systemConfig, credentialValues]);

  const handleCancel = useCallback(() => {
    if (!sendAgentRequest) return;

    onToolUpdate?.(tool.id, { status: "declined" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_event",
          toolCallId: tool.id,
          toolName: "create_system",
          event: "declined",
        },
      ],
    });
  }, [sendAgentRequest, onToolUpdate, tool.id]);

  const allCredentialsProvided = useMemo(() => {
    return requiredSensitiveFields.every(
      (field) => credentialValues[field] && credentialValues[field].trim() !== "",
    );
  }, [requiredSensitiveFields, credentialValues]);

  if (!displaySystem) {
    if (isRefreshing || isToolInProgress) {
      return (
        <ToolCallWrapper
          tool={tool}
          openByDefault={true}
          statusOverride={isToolInProgress ? "running" : undefined}
        >
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
            </div>
            <div className="text-sm text-muted-foreground">Creating system...</div>
          </div>
        </ToolCallWrapper>
      );
    } else {
      return (
        <ToolCallWrapper tool={tool} openByDefault={true}>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
            </div>
            <div className="text-sm text-muted-foreground">
              No system data found - this is probably a bug
            </div>
          </div>
        </ToolCallWrapper>
      );
    }
  }

  const wrapperStatusOverride = isToolInProgress ? "running" : undefined;

  return (
    <ToolCallWrapper
      tool={tool}
      openByDefault={!isCompleted}
      statusOverride={wrapperStatusOverride}
    >
      <div className="space-y-4">
        {systemNotFound && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <strong>System Deleted:</strong> This system was removed from the database. Showing
                original tool call data.
              </div>
            </div>
          </div>
        )}

        <div
          className={`bg-background border rounded-lg p-4 ${
            isAwaitingConfirmation
              ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10"
              : showPendingMessage
                ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10"
                : "border-border"
          }`}
        >
          {showPendingMessage && (
            <div className="mb-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded">
              Showing input data - system will be created shortly
            </div>
          )}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              {displaySystem?.name || displaySystem?.id ? (
                <SystemIcon system={displaySystem} size={24} fallbackClassName="text-foreground" />
              ) : (
                <Globe className="h-6 w-6 text-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  System Endpoint
                </div>
                <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                  {displaySystem.url || "No API endpoint specified"}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">System</div>
                <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                  {displaySystem.name || displaySystem.id || "N/A"}
                </div>
              </div>

              {!isAwaitingConfirmation && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Authentication
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs ${colorClasses[badge.color as keyof typeof colorClasses]} px-2 py-1 rounded flex items-center gap-1`}
                    >
                      {badge.icon === "clock" ? (
                        <Clock className="h-3 w-3" />
                      ) : (
                        <Key className="h-3 w-3" />
                      )}
                      {badge.label}
                    </span>
                  </div>
                </div>
              )}

              {isAwaitingConfirmation && requiredSensitiveFields.length > 0 && (
                <div className="space-y-3 pt-2">
                  {requiredSensitiveFields.map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <KeyRound className="w-3 h-3 text-amber-500" />
                        {field}
                      </label>
                      <div className="relative">
                        <Input
                          type={showCredentials[field] ? "text" : "password"}
                          value={credentialValues[field] || ""}
                          onChange={(e) =>
                            setCredentialValues((prev) => ({ ...prev, [field]: e.target.value }))
                          }
                          placeholder={`Enter ${field}...`}
                          className="h-9 text-sm pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent"
                          onClick={() =>
                            setShowCredentials((prev) => ({ ...prev, [field]: !prev[field] }))
                          }
                        >
                          {showCredentials[field] ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {displaySystem.specificInstructions && displaySystem.specificInstructions.trim() && (
                <div>
                  <Collapsible
                    open={isInstructionsExpanded}
                    onOpenChange={setIsInstructionsExpanded}
                  >
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                        {isInstructionsExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        Additional API Instructions
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 bg-muted/30 border border-border p-3 rounded-md">
                        <div className="text-xs leading-relaxed whitespace-pre-wrap">
                          {displaySystem.specificInstructions}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>
          </div>
        </div>

        {(isAwaitingConfirmation || isExecuting) && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="glass"
              className="!bg-[#ffa500] hover:!bg-[#ffd700] dark:!bg-[#ffa500] dark:hover:!bg-[#ffd700] !text-black !border-amber-400/50 dark:!border-amber-500/50 font-semibold"
              onClick={handleConfirm}
              disabled={!allCredentialsProvided || isExecuting}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Confirming...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
            <Button size="sm" variant="glass" onClick={handleCancel} disabled={isExecuting}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}

export const CreateSystemComponent = memo(CreateSystemComponentImpl);

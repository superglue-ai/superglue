"use client";

import { useSystems, useInvalidateSystems } from "@/src/queries/systems";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useToast } from "@/src/hooks/use-toast";
import { useSystemActions } from "@/src/hooks/use-system-actions";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { maskCredentialValue, System, SystemInput, ToolCall } from "@superglue/shared";
import {
  createToolInteractionEntry,
  ToolMutation,
} from "@/src/lib/agent/agent-tools/tool-call-state";
import {
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
import { useAgentContext } from "../AgentContextProvider";

interface CreateSystemComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  onToolMutation?: (toolCallId: string, mutation: ToolMutation) => void;
  onAbortStream?: () => void;
}

interface CreateSystemOutput {
  success?: boolean;
  confirmationState?: string;
  systemConfig?: any;
  system?: System;
}

function CreateSystemComponentImpl({
  tool,
  onInputChange,
  onToolUpdate,
  onToolMutation,
  onAbortStream,
}: CreateSystemComponentProps) {
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(false);
  const [isPrefilledExpanded, setIsPrefilledExpanded] = useState(false);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const { sendAgentRequest } = useAgentContext();
  const { saveSystem, handleOAuth } = useSystemActions();
  const { toast } = useToast();
  const { systems, isRefreshing } = useSystems();
  const invalidateSystems = useInvalidateSystems();

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
      return typeof tool.input === "string" ? JSON.parse(tool.input) : tool.input;
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

  const systemConfig = output?.systemConfig || input;

  const allCredentialFields = useMemo(() => {
    const creds = systemConfig?.credentials;
    if (!creds || typeof creds !== "object") return {};
    return creds as Record<string, any>;
  }, [systemConfig?.credentials]);

  const { blankFields, prefilledFields } = useMemo(() => {
    const blank: string[] = [];
    const prefilled: string[] = [];
    for (const [key, value] of Object.entries(allCredentialFields)) {
      if (value === "" || value === null || value === undefined) {
        blank.push(key);
      } else {
        prefilled.push(key);
      }
    }
    return { blankFields: blank, prefilledFields: prefilled };
  }, [allCredentialFields]);

  const hasCredentials = Object.keys(allCredentialFields).length > 0;
  const isAwaitingConfirmation = tool.status === "awaiting_confirmation" && hasCredentials;
  const isConfirming = tool.status === "running" && hasCredentials;
  const isCompleted = tool.status === "completed" && output?.success;
  const isToolInProgress = tool.status === "running" || tool.status === "pending";

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
      invalidateSystems();
    }
  }, [isCompleted, systemId, invalidateSystems]);

  useEffect(() => {
    if (isCompleted || tool.status === "declined" || tool.status === "error") {
      setIsExecuting(false);
    }
  }, [isCompleted, tool.status]);

  const handleConfirm = useCallback(() => {
    if (!sendAgentRequest) return;

    const allValues: Record<string, string> = {};
    for (const key of Object.keys(allCredentialFields)) {
      if (Object.prototype.hasOwnProperty.call(credentialValues, key)) {
        allValues[key] = credentialValues[key].trim();
      } else if (allCredentialFields[key] !== undefined && allCredentialFields[key] !== null) {
        allValues[key] = String(allCredentialFields[key]);
      }
    }

    setIsExecuting(true);
    onToolUpdate?.(tool.id, { status: "running" });
    onToolMutation?.(tool.id, {
      interactionEntry: createToolInteractionEntry(
        "user_submitted_credentials_and_confirmed_system_creation",
        {
          credentialsSummary: Object.fromEntries(
            Object.entries(allValues)
              .filter(([_, v]) => v?.trim())
              .map(([k, v]) => [k, maskCredentialValue(k, v)]),
          ),
        },
      ),
      confirmationState: "confirmed",
      confirmationData: {
        systemConfig,
        userProvidedCredentials: allValues,
      },
    });

    sendAgentRequest(undefined, {
      resumeToolCallId: tool.id,
    });
  }, [
    allCredentialFields,
    credentialValues,
    onToolMutation,
    onToolUpdate,
    sendAgentRequest,
    systemConfig,
    tool.id,
  ]);

  const handleCancel = useCallback(() => {
    if (!sendAgentRequest) return;

    onToolUpdate?.(tool.id, { status: "declined" });
    onToolMutation?.(tool.id, {
      interactionEntry: createToolInteractionEntry("user_declined_system_creation"),
      confirmationState: "declined",
    });

    sendAgentRequest(undefined, {
      resumeToolCallId: tool.id,
    });
  }, [onToolMutation, onToolUpdate, sendAgentRequest, tool.id]);

  const allBlankFieldsFilled = useMemo(() => {
    if (blankFields.length === 0) return true;
    return blankFields.every(
      (field) => credentialValues[field] && credentialValues[field].trim() !== "",
    );
  }, [blankFields, credentialValues]);

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

  if (isToolInProgress && !isAwaitingConfirmation) {
    return (
      <ToolCallWrapper tool={tool} openByDefault={true} statusOverride="running">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
          </div>
          <div className="text-sm text-muted-foreground">Creating system...</div>
        </div>
      </ToolCallWrapper>
    );
  }

  return (
    <ToolCallWrapper tool={tool} openByDefault={!isCompleted}>
      <div className="space-y-4">
        <div
          className={`bg-background border rounded-lg p-4 ${
            isAwaitingConfirmation ? "border-amber-200 dark:border-amber-800" : "border-border"
          }`}
        >
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
                  {displaySystem.url || "No endpoint specified"}
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

              {isAwaitingConfirmation && blankFields.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-medium text-muted-foreground">Enter credentials</div>
                  {blankFields.map((field) => (
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

              {isAwaitingConfirmation && prefilledFields.length > 0 && (
                <Collapsible open={isPrefilledExpanded} onOpenChange={setIsPrefilledExpanded}>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors pt-2">
                      {isPrefilledExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Pre-filled configuration ({prefilledFields.length} field
                      {prefilledFields.length !== 1 ? "s" : ""})
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3 pt-2">
                      {prefilledFields.map((field) => (
                        <div key={field} className="space-y-1">
                          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            <KeyRound className="w-3 h-3 text-muted-foreground" />
                            {field}
                          </label>
                          <div className="relative">
                            <Input
                              type={showCredentials[field] ? "text" : "password"}
                              value={
                                credentialValues[field] !== undefined
                                  ? credentialValues[field]
                                  : String(allCredentialFields[field] ?? "")
                              }
                              onChange={(e) =>
                                setCredentialValues((prev) => ({
                                  ...prev,
                                  [field]: e.target.value,
                                }))
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
                  </CollapsibleContent>
                </Collapsible>
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
                        Additional System Instructions
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
              onClick={handleConfirm}
              disabled={!allBlankFieldsFilled || isExecuting}
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

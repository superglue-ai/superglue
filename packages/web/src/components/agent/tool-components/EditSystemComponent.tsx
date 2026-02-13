"use client";

import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { UserAction } from "@/src/lib/agent/agent-types";
import { cn } from "@/src/lib/general-utils";
import { ToolCall } from "@superglue/shared";
import { AlertCircle, CheckCircle, Eye, EyeOff, KeyRound, Loader2, Settings } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface ModifySystemComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  onAbortStream?: () => void;
}

interface ModifySystemInput {
  id: string;
  sensitiveCredentials?: Record<string, boolean>;
  [key: string]: any;
}

interface ModifySystemOutput {
  success?: boolean;
  confirmationState?: string;
  systemConfig?: any;
  requiredSensitiveFields?: string[];
  systemId?: string;
  system?: {
    id: string;
    [key: string]: any;
  };
}

function ModifySystemComponentImpl({
  tool,
  onInputChange,
  onToolUpdate,
  sendAgentRequest,
  onAbortStream,
}: ModifySystemComponentProps) {
  const { systems, refreshSystems } = useSystems();
  const hasRefreshedRef = useRef(false);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [isExecuting, setIsExecuting] = useState(false);

  const input = (() => {
    if (!tool.input) return null;
    try {
      return typeof tool.input === "string"
        ? JSON.parse(tool.input)
        : (tool.input as ModifySystemInput);
    } catch {
      return null;
    }
  })();

  const output = (() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string"
        ? JSON.parse(tool.output)
        : (tool.output as ModifySystemOutput);
    } catch {
      return null;
    }
  })();

  const systemConfig = output?.systemConfig || input;
  const systemId = output?.systemId || output?.system?.id || systemConfig?.id || input?.id;
  const systemFromContext = useMemo(() => {
    return systemId ? systems.find((i) => i.id === systemId) : null;
  }, [systems, systemId]);
  const displayName =
    systemFromContext?.name || output?.system?.name || systemConfig?.name || systemId;

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
  const isCompleted = tool.status === "completed" && output?.success;
  const isToolInProgress =
    tool.status === "running" ||
    tool.status === "pending" ||
    (tool.status === "awaiting_confirmation" && !hasSensitiveCredentials);
  const hasError =
    tool.status === "error" || (output && !output.success && !output.confirmationState);

  useEffect(() => {
    if (isCompleted && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      refreshSystems();
    }
  }, [isCompleted, refreshSystems]);

  useEffect(() => {
    if (isCompleted || hasError || tool.status === "declined") {
      setIsExecuting(false);
    }
  }, [isCompleted, hasError, tool.status]);

  const handleConfirm = useCallback(() => {
    if (!sendAgentRequest) return;

    setIsExecuting(true);
    onToolUpdate?.(tool.id, { status: "running" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_event",
          toolCallId: tool.id,
          toolName: "edit_system",
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
          toolName: "edit_system",
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

  if (!input) {
    return (
      <ToolCallWrapper tool={tool}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <div className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full" />
          </div>
          <div className="text-sm text-muted-foreground">No input data available</div>
        </div>
      </ToolCallWrapper>
    );
  }

  const getStatusIcon = () => {
    if (isCompleted) return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />;
    if (hasError) return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    if (isToolInProgress)
      return <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />;
    if (isAwaitingConfirmation)
      return <Settings className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    return (
      <div className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
        <div className="w-1.5 h-1.5 bg-amber-600 dark:bg-amber-400 rounded-full" />
      </div>
    );
  };

  const getStatusText = () => {
    if (isCompleted) return "Updated system";
    if (hasError) return "Update failed";
    if (isToolInProgress) return "Updating system";
    if (isAwaitingConfirmation) return "Update system";
    return "Update system";
  };

  const wrapperStatusOverride =
    tool.status === "awaiting_confirmation" && !hasSensitiveCredentials ? "running" : undefined;

  return (
    <ToolCallWrapper tool={tool} openByDefault={true} statusOverride={wrapperStatusOverride}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
          <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {displayName}
          </code>
        </div>

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

        {(isAwaitingConfirmation || isExecuting) && (
          <div className="flex items-center gap-2 pt-1">
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
                  Updating...
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

        {hasError && tool.error && (
          <div className="border border-red-200/40 dark:border-red-700/40 p-3 rounded-md flex items-start gap-2 overflow-hidden">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 dark:text-red-200 break-words min-w-0 max-h-40 overflow-y-auto">
              {typeof tool.error === "string" ? tool.error : "Update failed"}
            </div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}

export const ModifySystemComponent = memo(ModifySystemComponentImpl);

"use client";

import { useSystems } from "@/src/app/systems-context";
import { ToolCall } from "@superglue/shared";
import { AlertCircle, CheckCircle, Edit3 } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface ModifySystemComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

interface ModifySystemInput {
  id: string;
  [key: string]: any; // Other fields that are being modified
}

interface ModifySystemOutput {
  success: boolean;
  note?: string;
  system: {
    id: string;
    [key: string]: any;
  };
}

function ModifySystemComponentImpl({ tool, onInputChange }: ModifySystemComponentProps) {
  const { refreshSystems } = useSystems();
  const hasRefreshedRef = useRef(false);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [isExecuting, setIsExecuting] = useState(false);

  // Parse input and output
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

  const isCompleted = tool.status === "completed" && output?.success;
  const isToolInProgress = tool.status === "running" || tool.status === "pending";
  const hasError = tool.status === "error" || (output && !output.success);

  // Refresh systems when modification is complete
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

  const changes = useMemo(() => {
    const configToUse = systemConfig || input;
    if (!configToUse) return [];
    return Object.entries(configToUse)
      .filter(([key]) => key !== "id" && key !== "sensitiveCredentials")
      .map(([key, newValue]) => {
        const oldValue = originalSystem ? (originalSystem as any)[key] : undefined;
        return { key, oldValue, newValue };
      });
  }, [systemConfig, input, originalSystem]);

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

  return (
    <ToolCallWrapper tool={tool} openByDefault={true}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {isCompleted ? (
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : hasError ? (
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          ) : isToolInProgress ? (
            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <div className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full" />
            </div>
          )}
          <div>
            <div className="text-sm font-medium">
              {isCompleted
                ? "Updated System successfully"
                : hasError
                  ? "border-red-200/40 dark:border-red-700/40"
                  : "border-border",
            )}
          >
            {changes.map((change, index) => (
              <div key={index}>
                {change.oldValue !== undefined && (
                  <DiffLine type="removed" fieldName={change.key} value={change.oldValue} />
                )}
                <DiffLine type="added" fieldName={change.key} value={change.newValue} />
              </div>
            ))}
          </div>
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

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {isCompleted ? "Changes made:" : "Changes to be made:"}
              </span>
            </div>

            {changes.length > 0 ? (
              <div className="space-y-2">
                {changes.map((change, index) => (
                  <div key={index} className="flex items-start gap-3 p-2 bg-muted/30 rounded">
                    <div className="text-xs bg-muted-foreground/20 text-foreground px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
                      {change.key}
                    </div>
                    <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded min-w-0 flex-1">
                      <span className="break-words">
                        {typeof change.value === "string"
                          ? `"${change.value}"`
                          : JSON.stringify(change.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">No changes specified</div>
            )}
          </div>
        </div>

        {/* Error Message */}
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

// Memoize the component to prevent unnecessary re-renders
export const ModifySystemComponent = memo(ModifySystemComponentImpl);

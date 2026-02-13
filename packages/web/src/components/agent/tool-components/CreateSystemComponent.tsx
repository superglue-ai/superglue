"use client";

import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useToast } from "@/src/hooks/use-toast";
import { useSystemActions } from "@/src/hooks/use-system-actions";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { composeUrl, getSimpleIcon } from "@/src/lib/general-utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { systemOptions, ToolCall } from "@superglue/shared";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit,
  Globe,
  Key,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SystemForm } from "../../systems/SystemForm";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface CreateSystemComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

interface CreateSystemInput {
  id: string;
  name: string;
  urlHost: string;
  urlPath: string;
  credentials: Record<string, any>;
  documentationUrl?: string;
  documentationKeywords?: string[];
  specificInstructions?: string;
}

interface CreateSystemOutput {
  success: boolean;
  note?: string;
  system: {
    id: string;
    name: string;
    urlHost: string;
    urlPath: string;
    credentials: Record<string, any>;
    documentationUrl?: string;
    documentationKeywords?: string[];
    specificInstructions?: string;
    documentationPending?: boolean;
    icon?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

function CreateSystemComponentImpl({ tool, onInputChange }: CreateSystemComponentProps) {
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [systemNotFound, setSystemNotFound] = useState(false);
  const { saveSystem, handleOAuth } = useSystemActions();
  const { toast } = useToast();
  const { systems, refreshSystems, isRefreshing } = useSystems();

  const getAuthBadge = useCallback((credentials: Record<string, any>) => {
    if (!credentials || Object.keys(credentials).length === 0) {
      return { color: "amber", label: "No Auth", icon: "clock" };
    }

    // Check for common auth types
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

  // Handle system save
  const handleSystemSave = useCallback(
    async (systemData: any) => {
      try {
        // Close the modal first to prevent scroll issues
        setIsEditModalOpen(false);

        // Save to database using the hook
        const savedSystem = await saveSystem(systemData);

        if (savedSystem) {
          // Refresh systems from context to get updated data
          await refreshSystems();

          // Check if OAuth should be triggered
          const grantType = systemData.credentials?.grant_type || "authorization_code";
          const shouldTriggerOAuth =
            systemData.credentials &&
            // For authorization code: trigger if OAuth is not configured yet
            ((grantType === "authorization_code" &&
              (!systemData.credentials.access_token || !systemData.credentials.refresh_token)) ||
              // For client credentials: trigger if OAuth fields have changed (backend will handle it)
              (grantType === "client_credentials" &&
                systemData.credentials.client_id &&
                systemData.credentials.client_secret));

          if (shouldTriggerOAuth) {
            // Handle OAuth flow
            await handleOAuth(savedSystem);
          }

          toast({
            title: "System Updated",
            description: "System has been updated successfully.",
          });

          return savedSystem;
        } else {
          throw new Error("Failed to save system");
        }
      } catch (error) {
        console.error("Error updating system:", error);
        toast({
          title: "Error",
          description: "Failed to update system.",
          variant: "destructive",
        });
        return null;
      }
    },
    [saveSystem, handleOAuth, toast, refreshSystems],
  );

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setIsEditModalOpen(false);
  }, []);

  // Parse input and output
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

  const isCompleted = tool.status === "completed" && output?.success;
  const isToolInProgress = tool.status === "running" || tool.status === "pending";
  const hasNoOutput = !output || !output.success;

  const systemConfig = output?.systemConfig || input;

  const systemId = output?.system?.id || systemConfig?.id || input?.id;
  const systemName = output?.system?.name || systemConfig?.name || input?.name;
  const systemFromContext = useMemo(() => {
    if (systemId) return systems.find((i) => i.id === systemId) || null;
    if (systemName) return systems.find((i) => i.name === systemName) || null;
    return null;
  }, [systems, systemId, systemName]);

  const displaySystem = systemFromContext || output?.system || input;

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

  // Refresh systems when tool completes to get the newly created system
  const hasTriggeredRefreshRef = useRef(false);
  useEffect(() => {
    if (isCompleted && systemId && !hasTriggeredRefreshRef.current) {
      hasTriggeredRefreshRef.current = true;
      refreshSystems();
    }
  }, [isCompleted, systemId, refreshSystems]);

  // Track if we've ever seen this system in context (to detect deletion)
  const wasFoundInContextRef = useRef(false);
  useEffect(() => {
    if (systemFromContext) {
      wasFoundInContextRef.current = true;
      setSystemNotFound(false);
    } else if (wasFoundInContextRef.current && !isRefreshing) {
      // We previously found it but now it's gone - it was deleted
      setSystemNotFound(true);
    }
  }, [systemFromContext, isRefreshing]);

  if (!displaySystem) {
    if (isRefreshing || isToolInProgress) {
      return (
        <ToolCallWrapper tool={tool} openByDefault={true}>
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

  return (
    <ToolCallWrapper tool={tool} openByDefault={true}>
      <div className="space-y-4">
        {/* Warning Banner for Deleted System */}
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

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isCompleted ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
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
                {isCompleted ? "Created System" : isToolInProgress ? "Creating System" : "System"}
              </div>
              <div className="text-lg font-semibold">
                {displaySystem.name || displaySystem.id || "System"}
              </div>
            </div>
          </div>

          {/* Edit Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => !systemNotFound && !isToolInProgress && setIsEditModalOpen(true)}
            disabled={systemNotFound || isToolInProgress}
            className="h-8 w-8 p-0 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              systemNotFound
                ? "Cannot edit deleted system"
                : isToolInProgress
                  ? "Cannot edit while tool is running"
                  : "Edit system"
            }
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>

        {/* System Details */}
        <div
          className={`bg-background border rounded-lg p-4 ${
            isToolInProgress || hasNoOutput
              ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10"
              : "border-border"
          }`}
        >
          {/* Input Data Indicator */}
          {(isToolInProgress || hasNoOutput) && (
            <div className="mb-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded">
              Showing input data - system will be created shortly
            </div>
          )}
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="flex-shrink-0">
              {displaySystem?.name || displaySystem?.id ? (
                <SystemIcon system={displaySystem} size={24} fallbackClassName="text-foreground" />
              ) : (
                <Globe className="h-6 w-6 text-foreground" />
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* 1. API Endpoint */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">API Endpoint</div>
                <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                  {(() => {
                    // Check for different possible URL properties
                    const urlHost = displaySystem.urlHost || displaySystem.host || "";
                    const urlPath = displaySystem.urlPath || displaySystem.path || "";

                    // If we have a host, compose the URL
                    if (urlHost) {
                      return composeUrl(urlHost, urlPath);
                    }

                    // If we have a path but no host, show just the path
                    if (urlPath) {
                      return urlPath;
                    }

                    // If neither, show a placeholder
                    return "No API endpoint specified";
                  })()}
                </div>
              </div>

              {/* 2. System ID */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">System</div>
                <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                  {displaySystem.name || displaySystem.id || "N/A"}
                </div>
              </div>

              {/* 3. Authentication */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Authentication</div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs ${colorClasses[badge.color]} px-2 py-1 rounded flex items-center gap-1`}
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

              {/* 4. Additional API Instructions */}
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

        {/* Edit Modal */}
        <Dialog
          open={isEditModalOpen && !systemNotFound && !isToolInProgress}
          onOpenChange={(open) => {
            if (!open) {
              handleModalClose();
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit System</DialogTitle>
              <DialogDescription>Modify the system settings and credentials.</DialogDescription>
            </DialogHeader>
            <SystemForm
              system={displaySystem}
              onSave={handleSystemSave}
              onCancel={handleModalClose}
              systemOptions={systemOptions}
              getSimpleIcon={getSimpleIcon}
              modal={true}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ToolCallWrapper>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const CreateSystemComponent = memo(CreateSystemComponentImpl);

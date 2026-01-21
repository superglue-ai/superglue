"use client";

import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { useSystems } from "@/src/app/systems-context";
import { SystemForm } from "@/src/components/systems/SystemForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { DocStatus } from "@/src/components/utils/DocStatusSpinner";
import { useToast } from "@/src/hooks/use-toast";
import { createSuperglueClient, needsUIToTriggerDocFetch } from "@/src/lib/client-utils";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { composeUrl, getSimpleIcon } from "@/src/lib/general-utils";
import {
  buildOAuthFieldsFromSystem,
  createOAuthErrorHandler,
  triggerOAuthFlow,
} from "@/src/lib/oauth-utils";
import type { System } from "@superglue/shared";
import { CredentialMode, UpsertMode } from "@superglue/shared";
import { systemOptions } from "@superglue/shared";
import { waitForSystemProcessing } from "@superglue/shared/utils";
import {
  Clock,
  FileDown,
  Globe,
  Key,
  Pencil,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export const detectAuthType = (credentials: any): "oauth" | "apikey" | "none" => {
  if (!credentials || Object.keys(credentials).length === 0) return "none";

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
  ];

  const allKeys = Object.keys(credentials);

  const hasOAuthFields = allKeys.some((key) => oauthSpecificFields.includes(key));

  if (hasOAuthFields) return "oauth";

  return "apikey";
};

export const getAuthBadge = (
  system: System,
): {
  type: "oauth-configured" | "oauth-incomplete" | "apikey" | "none";
  label: string;
  color: "blue" | "amber" | "green";
  icon: "key" | "clock";
} => {
  const creds = system.credentials || {};
  const authType = detectAuthType(creds);

  if (authType === "none") {
    return { type: "none", label: "No auth", color: "amber", icon: "key" };
  }

  if (authType === "oauth") {
    const hasAccess = !!creds.access_token;
    const hasClientConfig = !!creds.client_id || !!creds.client_secret;

    return hasAccess
      ? { type: "oauth-configured", label: "OAuth configured", color: "blue", icon: "key" }
      : hasClientConfig
        ? { type: "oauth-incomplete", label: "OAuth incomplete", color: "amber", icon: "clock" }
        : { type: "none", label: "No auth", color: "amber", icon: "key" };
  }

  return { type: "apikey", label: "API Key", color: "green", icon: "key" };
};

export default function SystemsPage() {
  const config = useConfig();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    systems,
    pendingDocIds,
    loading: initialLoading,
    isRefreshing,
    refreshSystems,
    setPendingDocIds,
  } = useSystems();

  useEffect(() => {
    refreshSystems();
  }, [refreshSystems]);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const system = searchParams.get("system");
    const message = searchParams.get("message");
    const description = searchParams.get("description");

    if (success === "oauth_completed" && system) {
      toast({
        title: "OAuth Connection Successful",
        description: `Successfully connected to ${system}`,
      });
    } else if (error) {
      const errorMessage = description || message || "Failed to complete OAuth connection";
      const handleOAuthError = createOAuthErrorHandler(system || "unknown", toast);
      handleOAuthError(errorMessage);
    }
  }, [searchParams, toast]);

  const { waitForSystemReady } = useMemo(
    () => ({
      waitForSystemReady: (systemIds: string[]) => {
        const clientAdapter = {
          getSystem: (id: string) => {
            const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
            return client.getSystem(id);
          },
        };
        return waitForSystemProcessing(clientAdapter, systemIds);
      },
    }),
    [],
  );

  const [editingSystem, setEditingSystem] = useState<System | null>(null);

  // OAuth flows now use callbacks directly, no need for message listener

  const [addFormOpen, setAddFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const filteredSystems =
    systems
      ?.filter((system) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          system.id.toLowerCase().includes(query) ||
          system.urlHost?.toLowerCase().includes(query) ||
          system.urlPath?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id)) || [];

  const paginatedSystems = filteredSystems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredSystems.length / PAGE_SIZE);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [systemToDelete, setSystemToDelete] = useState<System | null>(null);

  const handleDelete = async (id: string) => {
    try {
      const client = createSuperglueClient(config.superglueEndpoint);
      await client.deleteSystem(id);
      await refreshSystems();
    } catch (error) {
      console.error("Error deleting system:", error);
      toast({
        title: "Error",
        description: "Failed to delete system",
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (system: System) => {
    setEditingSystem(system);
    setAddFormOpen(true);
  };
  const handleAdd = () => {
    setEditingSystem(null);
    setAddFormOpen(true);
  };

  const handleCompleteOAuth = (system: System) => {
    const oauthFields = buildOAuthFieldsFromSystem(system);

    const authType = detectAuthType(system.credentials || {});

    const handleOAuthError = createOAuthErrorHandler(system.id, toast);

    const handleOAuthSuccess = (tokens: any) => {
      if (tokens) {
        toast({
          title: "OAuth Connection Successful",
          description: `Successfully connected to ${system.id}`,
        });

        if (editingSystem?.id === system.id) {
          const updatedSystem = {
            ...editingSystem,
            credentials: {
              ...editingSystem.credentials,
              ...tokens,
            },
          };
          setEditingSystem(updatedSystem);
        }
      }
    };

    triggerOAuthFlow(
      system.id,
      oauthFields,
      tokenRegistry.getToken(),
      authType,
      handleOAuthError,
      true,
      undefined,
      handleOAuthSuccess,
      config.superglueEndpoint,
      undefined, // suppressErrorUI
      config.apiEndpoint,
    );
  };

  const cleanSystemForInput = (system: System) => {
    return {
      id: system.id,
      urlHost: system.urlHost,
      urlPath: system.urlPath,
      documentationUrl: system.documentationUrl,
      documentation: system.documentation,
      specificInstructions: system.specificInstructions,
      credentials: system.credentials,
      ...(system.documentationPending !== undefined && {
        documentationPending: system.documentationPending,
      }),
    };
  };

  const handleSave = async (system: System, isOAuthConnect?: boolean): Promise<System | null> => {
    try {
      if (system.id) {
        const existingSystem = systems.find((i) => i.id === system.id);
        const mode = existingSystem ? UpsertMode.UPDATE : UpsertMode.CREATE;
        const cleanedSystem = cleanSystemForInput(system);

        const client = createSuperglueClient(config.superglueEndpoint);
        const savedSystem = await client.upsertSystem(
          system.id,
          cleanedSystem,
          mode,
          CredentialMode.REPLACE,
        );

        const willTriggerDocFetch = needsUIToTriggerDocFetch(savedSystem, existingSystem);

        if (willTriggerDocFetch) {
          setPendingDocIds((prev) => new Set([...prev, savedSystem.id]));

          // Fire-and-forget poller for background doc fetch
          waitForSystemReady([savedSystem.id])
            .then(() => {
              // Remove from pending when done
              setPendingDocIds((prev) => new Set([...prev].filter((id) => id !== savedSystem.id)));
            })
            .catch((error) => {
              console.error("Error waiting for docs:", error);
              // Remove from pending on error
              setPendingDocIds((prev) => new Set([...prev].filter((id) => id !== savedSystem.id)));
            });
        }

        if (isOAuthConnect) {
          const currentCreds = JSON.stringify(editingSystem?.credentials || {});
          const newCreds = JSON.stringify(savedSystem.credentials || {});
          if (currentCreds !== newCreds) {
            setEditingSystem(savedSystem);
          }
        } else {
          setEditingSystem(null);
          setAddFormOpen(false);
        }

        await refreshSystems();

        return savedSystem;
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

  const handleRefreshDocs = async (systemId: string) => {
    const system = systems.find((i) => i.id === systemId);
    if (!system) return;
    setPendingDocIds((prev) => new Set([...prev, systemId]));

    try {
      const upsertData = cleanSystemForInput({
        ...system,
        documentationPending: true,
      });

      const client = createSuperglueClient(config.superglueEndpoint);
      await client.upsertSystem(systemId, upsertData, UpsertMode.UPDATE);

      const results = await waitForSystemReady([systemId]);

      if (results.length > 0 && results[0]?.documentation) {
        setPendingDocIds((prev) => new Set([...prev].filter((id) => id !== systemId)));

        toast({
          title: "Documentation Ready",
          description: `Documentation for system "${systemId}" is now ready!`,
          variant: "default",
        });
      } else {
        await client.upsertSystem(
          systemId,
          {
            ...upsertData,
            documentationPending: false,
          },
          UpsertMode.UPDATE,
        );

        setPendingDocIds((prev) => new Set([...prev].filter((id) => id !== systemId)));
      }
    } catch (error) {
      console.error("Error refreshing docs:", error);
      try {
        const sys = systems.find((i) => i.id === systemId);
        if (sys) {
          const resetData = cleanSystemForInput({
            ...sys,
            documentation: sys.documentation || "",
            documentationPending: false,
          });

          const client = createSuperglueClient(config.superglueEndpoint);
          await client.upsertSystem(systemId, resetData, UpsertMode.UPDATE);
        }
      } catch (resetError) {
        console.error("Error resetting documentationPending:", resetError);
      }

      setPendingDocIds((prev) => new Set([...prev].filter((id) => id !== systemId)));
    }
  };

  const hasDocumentation = (system: System) => {
    return !!(system.documentationUrl?.trim() && !pendingDocIds.has(system.id));
  };


  const handleRefresh = async () => {
    await refreshSystems();
  };

  const blockAllContent = initialLoading && !addFormOpen;

  return (
    <div className="flex flex-col min-h-full p-8 w-full">
      {blockAllContent ? null : (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold">Systems</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="transition-transform"
            >
              <RotateCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {addFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
              <div className="bg-background rounded-xl max-w-2xl w-full p-0">
                <SystemForm
                  modal={true}
                  system={editingSystem}
                  onSave={handleSave}
                  onCancel={() => {
                    setAddFormOpen(false);
                    setEditingSystem(null);
                  }}
                  systemOptions={systemOptions}
                  getSimpleIcon={getSimpleIcon}
                />
              </div>
            </div>
          )}
          {systems.length === 0 && !addFormOpen ? (
            <div className="flex flex-col items-center justify-center flex-1 py-24">
              <Globe className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground mb-2">No systems added yet.</p>
              <p className="text-sm text-muted-foreground mb-6">
                Systems let you connect to APIs and data sources for your tools.
              </p>
              <Button variant="outline" size="sm" onClick={handleAdd}>
                <Plus className="mr-2 h-4 w-4" /> Add System
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center gap-3 mb-2">
                <Input
                  placeholder="Search systems..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="flex-1 h-8"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAdd}
                  className="hidden sm:inline-flex"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add System
                </Button>
              </div>
              {paginatedSystems.map((sys) => {
                const badge = getAuthBadge(sys);
                return (
                  <div key={sys.id} className="relative">
                    <div className="flex items-center gap-3 border rounded-lg p-4 bg-card">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <SystemIcon system={sys} size={20} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-medium truncate">{sys.id}</span>
                          <span className="text-sm text-muted-foreground truncate">
                            {composeUrl(sys.urlHost, sys.urlPath) || "No API endpoint"}
                          </span>
                        </div>
                      </div>
                      <div className="hidden sm:flex flex-row items-center gap-3 ml-auto">
                        <div className="flex items-center gap-2">
                          <DocStatus
                            pending={pendingDocIds.has(sys.id)}
                            hasDocumentation={hasDocumentation(sys)}
                          />
                          {(() => {
                            const colorClasses = {
                              blue: "text-blue-600 dark:text-blue-300 bg-blue-500/10",
                              amber: "text-amber-800 dark:text-amber-300 bg-amber-500/10",
                              green: "text-green-800 dark:text-green-300 bg-green-500/10",
                            };

                            return (
                              <span
                                className={`text-xs ${colorClasses[badge.color]} px-2 py-0.5 rounded flex items-center gap-1 whitespace-nowrap`}
                              >
                                {badge.icon === "clock" ? (
                                  <Clock className="h-3 w-3" />
                                ) : (
                                  <Key className="h-3 w-3" />
                                )}
                                {badge.label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() =>
                              badge.type === "oauth-incomplete"
                                ? handleCompleteOAuth(sys)
                                : router.push(`/tools?system=${sys.id}`)
                            }
                            title={
                              badge.type === "oauth-incomplete"
                                ? "Start OAuth flow to complete configuration"
                                : "Build a tool with this system"
                            }
                            disabled={false}
                          >
                            {badge.type === "oauth-incomplete" ? (
                              <>
                                <Key className="h-4 w-4 mr-2" />
                                Complete OAuth
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Build Tool
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => handleRefreshDocs(sys.id)}
                            disabled={
                              !sys.documentationUrl ||
                              !sys.documentationUrl.trim() ||
                              (pendingDocIds.has(sys.id) &&
                                Date.now() - new Date(sys.updatedAt).getTime() < 60000) ||
                              sys.documentationUrl.startsWith("file://")
                            }
                            title={
                              pendingDocIds.has(sys.id)
                                ? "Documentation is already being processed"
                                : sys.documentationUrl?.startsWith("file://")
                                  ? "Cannot refresh file uploads"
                                  : !sys.documentationUrl || !sys.documentationUrl.trim()
                                    ? "No documentation URL to refresh"
                                    : "Refresh documentation from URL"
                            }
                          >
                            <FileDown className="h-4 w-4 mr-2" />
                            Refresh Docs
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => handleEdit(sys)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setSystemToDelete(sys);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between items-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete System?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete the system "{systemToDelete?.id}"? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (systemToDelete) {
                      await handleDelete(systemToDelete.id);
                      setDeleteDialogOpen(false);
                      setSystemToDelete(null);
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

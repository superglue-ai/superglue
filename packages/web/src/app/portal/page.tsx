"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { ConfirmButton } from "@/src/components/ui/confirm-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { copyToClipboard } from "@/src/components/tools/shared/CopyButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { useToast } from "@/src/hooks/use-toast";
import { triggerOAuthFlow, createOAuthErrorHandler } from "@/src/lib/oauth-utils";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  LogOut,
  Link2,
  Link2Off,
  User,
  Blocks,
  Key,
  Copy,
  Check,
  ExternalLink,
  Book,
} from "lucide-react";
import type { EndUser } from "@superglue/shared";

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || "https://api.superglue.ai";

interface SystemOAuth {
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string;
  clientId?: string;
  grantType?: string;
}

interface SystemInfo {
  id: string;
  name: string;
  urlHost?: string;
  icon?: string;
  hasCredentials: boolean;
  oauth?: SystemOAuth;
  templateName?: string;
  authType?: "apikey" | "oauth" | "none";
  credentialFields?: string[]; // Field names for API key auth
}

interface PortalSession {
  sessionToken: string;
  endUser: EndUser;
  systems: SystemInfo[];
}

export default function PortalPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const token = searchParams.get("token");
  const preSelectedSystem = searchParams.get("system");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PortalSession | null>(null);
  const [authenticatingSystem, setAuthenticatingSystem] = useState<string | null>(null);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<SystemInfo | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Validate token and get session
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        // Check if we have an existing session
        const existingToken = localStorage.getItem("portal_session_token");
        if (existingToken) {
          try {
            await refreshSession(existingToken);
            return;
          } catch {
            // Invalid session, clear it
            localStorage.removeItem("portal_session_token");
          }
        }
        setError("No authentication token provided. Please use a valid portal link.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/portal/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to validate token");
        }

        const data = await response.json();

        // Store session token for subsequent requests
        localStorage.setItem("portal_session_token", data.sessionToken);

        // Refresh to get full session data
        await refreshSession(data.sessionToken);

        // Remove token from URL for cleaner UX
        router.replace("/portal");
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    validateToken();
  }, [token, router]);

  const refreshSession = async (sessionToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/v1/portal/session`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Session expired. Please use a new portal link.");
      }

      const data = await response.json();
      setSession({
        sessionToken,
        endUser: data.endUser,
        systems: data.systems,
      });

      // Fetch API keys
      await fetchApiKeys(sessionToken);

      setLoading(false);
    } catch (err: any) {
      localStorage.removeItem("portal_session_token");
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchApiKeys = async (sessionToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/v1/portal/api-keys`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_session_token");
    setSession(null);
    setLoggedOut(true);
  };

  const handleAuthenticate = async (systemId: string) => {
    if (!session) return;

    const system = session.systems.find((s) => s.id === systemId);
    if (!system) return;

    // Handle API key authentication
    if (system.authType === "apikey") {
      setSelectedSystem(system);
      // Initialize credential values
      const initialValues: Record<string, string> = {};
      system.credentialFields?.forEach((field) => {
        initialValues[field] = "";
      });
      setCredentialValues(initialValues);
      setCredentialDialogOpen(true);
      return;
    }

    // Handle OAuth authentication
    if (!system.oauth?.authUrl || !system.oauth?.tokenUrl) {
      toast({
        title: "Authentication not configured",
        description: "This system does not have authentication configured.",
        variant: "destructive",
      });
      return;
    }

    setAuthenticatingSystem(systemId);

    const handleOAuthError = createOAuthErrorHandler(systemId, toast);

    const handleOAuthSuccess = async (tokens: any) => {
      try {
        // Save the tokens to the portal backend
        const response = await fetch(`${API_ENDPOINT}/v1/portal/systems/${systemId}/credentials`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.sessionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            credentials: {
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              token_type: tokens.token_type,
              expires_in: tokens.expires_in,
            },
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save credentials");
        }

        toast({
          title: "Connected successfully",
          description: `You are now connected to ${system.name}.`,
        });

        // Refresh session to update UI
        await refreshSession(session.sessionToken);
      } catch (err: any) {
        toast({
          title: "Failed to save credentials",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setAuthenticatingSystem(null);
      }
    };

    // Build OAuth fields from system config
    const oauthFields = {
      auth_url: system.oauth.authUrl,
      token_url: system.oauth.tokenUrl,
      client_id: system.oauth.clientId,
      scopes: system.oauth.scopes,
      grant_type: system.oauth.grantType || "authorization_code",
    };

    // Template info if available
    const templateInfo = system.templateName
      ? { templateId: system.templateName, clientId: system.oauth.clientId }
      : undefined;

    // Trigger the OAuth flow with portal token
    // Portal flow: pass portalToken to fetch credentials server-side (secure)
    triggerOAuthFlow(
      systemId,
      oauthFields,
      undefined, // No API key for portal flow
      "oauth",
      (error) => {
        handleOAuthError(error);
        setAuthenticatingSystem(null);
      },
      true, // forceOAuth
      templateInfo,
      handleOAuthSuccess,
      undefined, // No GraphQL endpoint
      false, // suppressErrorUI
      API_ENDPOINT,
      session.sessionToken, // Portal token for secure credential fetch
    );
  };

  const handleDisconnect = async (systemId: string) => {
    if (!session) return;

    setDisconnecting(systemId);
    try {
      const response = await fetch(`${API_ENDPOINT}/v1/portal/systems/${systemId}/credentials`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }

      // Refresh session to update UI
      await refreshSession(session.sessionToken);
    } catch (err: any) {
      toast({
        title: "Failed to disconnect",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSaveCredentials = async () => {
    if (!session || !selectedSystem) return;

    try {
      const response = await fetch(
        `${API_ENDPOINT}/v1/portal/systems/${selectedSystem.id}/credentials`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.sessionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            credentials: credentialValues,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to save credentials");
      }

      // Refresh session to update UI
      await refreshSession(session.sessionToken);
      setCredentialDialogOpen(false);
      setSelectedSystem(null);
      setCredentialValues({});
    } catch (err: any) {
      toast({
        title: "Failed to save credentials",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const connectedCount = session?.systems.filter((s) => s.hasCredentials).length || 0;
  const totalSystems = session?.systems.length || 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Validating access...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold mb-2">Access Error</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          {error.includes("token") && (
            <p className="text-xs text-muted-foreground">
              Please contact your administrator or your agent for a valid portal link.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loggedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold mb-2">Session Ended</h1>
            <p className="text-sm text-muted-foreground">
              You have been logged out. Please use a new portal link to access your settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Blocks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Connection Portal</h1>
              <p className="text-xs text-muted-foreground">Manage account access</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">
                  {session.endUser.name || session.endUser.email || session.endUser.externalId}
                </p>
                {session.endUser.email && session.endUser.name && (
                  <p className="text-xs text-muted-foreground">{session.endUser.email}</p>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Tabs defaultValue="connections" className="space-y-6">
            <TabsList className="w-full bg-transparent p-0 h-auto border-b border-border rounded-none justify-start">
              <TabsTrigger
                value="connections"
                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
              >
                <Link2 className="h-4 w-4" />
                Connections
                <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                  {connectedCount}/{totalSystems}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="api-keys"
                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
              >
                <Key className="h-4 w-4" />
                API Keys
                {apiKeys.length > 0 && (
                  <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                    {apiKeys.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="getting-started"
                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
              >
                <Book className="h-4 w-4" />
                Getting Started
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connections" className="space-y-6">
              {/* Systems List */}
              {session.systems.length === 0 ? (
                <div className="rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm border border-dashed border-border/50 shadow-sm p-12 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Blocks className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">
                    No systems require authentication at this time.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {session.systems.map((system) => (
                    <div
                      key={system.id}
                      className={`rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm border shadow-sm overflow-hidden transition-all ${
                        preSelectedSystem === system.id
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border/50 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-12 w-12 rounded-xl bg-background/80 border border-border/50 flex items-center justify-center flex-shrink-0">
                            <SystemIcon
                              system={{ name: system.name, icon: system.icon }}
                              size={24}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{system.name}</div>
                            {system.urlHost && (
                              <div className="text-xs text-muted-foreground truncate">
                                {system.urlHost}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {system.hasCredentials ? (
                            <>
                              <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Connected
                              </Badge>
                              <ConfirmButton
                                onConfirm={() => handleDisconnect(system.id)}
                                confirmText=""
                                variant="ghost"
                                size="sm"
                                isLoading={disconnecting === system.id}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Link2Off className="h-4 w-4 mr-1" />
                                Disconnect
                              </ConfirmButton>
                            </>
                          ) : (
                            <Button
                              onClick={() => handleAuthenticate(system.id)}
                              disabled={authenticatingSystem === system.id}
                              className="gap-2"
                            >
                              {authenticatingSystem === system.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Connecting...
                                </>
                              ) : (
                                <>
                                  <Link2 className="h-4 w-4" />
                                  Connect
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Help Text */}
              <p className="text-xs text-muted-foreground text-center">
                Connections are securely stored and used only for authorized tool executions.
              </p>
            </TabsContent>

            <TabsContent value="api-keys" className="space-y-6">
              {/* API Keys Section */}
              {apiKeys.length === 0 ? (
                <div className="rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm border border-dashed border-border/50 shadow-sm p-12 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Key className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground mb-2">No API keys yet</p>
                  <p className="text-xs text-muted-foreground">
                    Ask your administrator to create an API key for you
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm border border-border/50 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Key className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold">Your API Keys</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Use these keys to access tools programmatically via REST API or MCP.
                  </p>
                  <div className="space-y-3">
                    {apiKeys.map((key) => {
                      return (
                        <div
                          key={key.id}
                          className={`rounded-lg bg-background/50 border overflow-hidden ${key.isActive ? "border-border/50" : "border-border/30 opacity-60"}`}
                        >
                          <div className="flex items-center justify-between p-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-sm break-all">
                                {key.key.slice(0, 6)}
                                {"•".repeat(Math.max(0, key.key.length - 6))}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Created {new Date(key.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={key.isActive ? "default" : "secondary"}
                                className={`text-xs ${key.isActive ? "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30" : ""}`}
                              >
                                {key.isActive ? "Active" : "Inactive"}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={async () => {
                                  const success = await copyToClipboard(key.key);
                                  if (success) {
                                    setCopiedKeyId(key.id);
                                    setTimeout(() => setCopiedKeyId(null), 1200);
                                  }
                                }}
                                title="Copy to clipboard"
                              >
                                {copiedKeyId === key.id ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="getting-started" className="space-y-6">
              {/* Documentation Links */}
              <div className="rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm border border-border/50 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Book className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Getting Started</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Learn how to use your API keys to access tools programmatically.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <a
                    href="https://docs.superglue.cloud/mcp/using-the-mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:border-primary/50 hover:bg-background transition-colors group"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Blocks className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm group-hover:text-primary transition-colors">
                        MCP Setup Guide
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Connect via Model Context Protocol
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </a>
                  <a
                    href="https://docs.superglue.cloud/api-reference/tools/run-a-tool"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 hover:border-primary/50 hover:bg-background transition-colors group"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Key className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm group-hover:text-primary transition-colors">
                        REST API Guide
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Call tools via HTTP requests
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </a>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* API Key Credential Dialog */}
      <Dialog open={credentialDialogOpen} onOpenChange={setCredentialDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect to {selectedSystem?.name}</DialogTitle>
            <DialogDescription>Enter your credentials to connect this system.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveCredentials();
            }}
            autoComplete="off"
          >
            <div className="space-y-4 py-4">
              {selectedSystem?.credentialFields?.map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>
                    {field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Label>
                  <Input
                    id={field}
                    type="password"
                    readOnly
                    onFocus={(e) => e.target.removeAttribute("readonly")}
                    value={credentialValues[field] || ""}
                    onChange={(e) =>
                      setCredentialValues((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    placeholder={`Enter ${field}`}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCredentialDialogOpen(false);
                  setSelectedSystem(null);
                  setCredentialValues({});
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Connect</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

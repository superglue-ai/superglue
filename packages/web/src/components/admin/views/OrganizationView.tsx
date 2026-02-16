"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { ConfirmButton } from "@/src/components/ui/confirm-button";
import { UserIcon } from "@/src/components/ui/user-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useToast } from "@/src/hooks/use-toast";
import { useOrgMembers } from "@/src/hooks/use-org-members";
import { tokenRegistry } from "@/src/lib/token-registry";
import { createEESuperglueClient } from "@/src/lib/ee-superglue-client";
import type { EndUser, EndUserCredentialStatus, System } from "@superglue/shared";
import { UserRole } from "@superglue/shared";
import {
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

interface EndUserWithCredentials extends EndUser {
  credentials?: EndUserCredentialStatus[];
}

interface EndUserFormData {
  externalId: string;
  email: string;
  name: string;
  allowedSystems: string[]; // ['*'] = all systems allowed
}

function EndUserRow({
  endUser,
  systems,
  onGeneratePortalUrl,
  onOpenPortal,
  onSendPortalLink,
  onEdit,
  onDelete,
}: {
  endUser: EndUserWithCredentials;
  systems: System[];
  onGeneratePortalUrl: (endUserId: string) => Promise<string | null>;
  onOpenPortal: (endUserId: string) => void;
  onSendPortalLink: (endUserId: string) => Promise<void>;
  onEdit: (endUser: EndUserWithCredentials) => void;
  onDelete: (endUserId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const connectedCount = endUser.credentials?.filter((c) => c.hasCredentials).length || 0;
  const totalSystems = endUser.credentials?.length || 0;

  // Check if user has access to all systems (['*'] means all access, null/[] means no access)
  const hasAllAccess = endUser.allowedSystems?.includes("*") || false;
  const allowedSystemIds = new Set(endUser.allowedSystems || []);

  // Get multi-tenancy systems (systems with multiTenancyMode enabled)
  const multiTenancySystems = systems.filter((s) => s.multiTenancyMode === "enabled");

  // Generate portal URL on mount
  useEffect(() => {
    const fetchUrl = async () => {
      const url = await onGeneratePortalUrl(endUser.id);
      setPortalUrl(url);
    };
    fetchUrl();
  }, [endUser.id]);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-border/50 dark:border-border/70 shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <UserIcon name={endUser.name} email={endUser.email} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate">
              {endUser.name || endUser.email || endUser.externalId}
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
              {endUser.email && endUser.name && <span>{endUser.email}</span>}
              <span className="font-mono">ID: {endUser.externalId}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasAllAccess ? (
            <Badge
              variant="outline"
              className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
            >
              <ShieldCheck className="h-3 w-3 mr-1" />
              All systems
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              <Shield className="h-3 w-3 mr-1" />
              {allowedSystemIds.size} system{allowedSystemIds.size !== 1 ? "s" : ""}
            </Badge>
          )}
          {totalSystems > 0 && (
            <Badge variant="outline" className="text-xs">
              {connectedCount}/{totalSystems} connected
            </Badge>
          )}
          {endUser.email && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={async (e) => {
                e.stopPropagation();
                setIsSendingEmail(true);
                await onSendPortalLink(endUser.id);
                setIsSendingEmail(false);
              }}
              disabled={isSendingEmail}
              title="Send portal link via email"
            >
              {isSendingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPortal(endUser.id);
            }}
            title="Open portal in new tab"
          >
            <DoorOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(endUser);
            }}
            title="Edit user"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <ConfirmButton
            onConfirm={() => onDelete(endUser.id)}
            confirmText=""
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </ConfirmButton>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && systems.length > 0 && (
        <div className="border-t border-border/50 px-4 py-3 bg-background/50">
          <div className="text-xs font-medium text-muted-foreground mb-2">System Access</div>
          <div className="space-y-2">
            {systems
              .filter((system) => hasAllAccess || allowedSystemIds.has(system.id))
              .map((system) => {
                const credential = endUser.credentials?.find((c) => c.systemId === system.id);
                const isMultiTenancy = system.multiTenancyMode === "enabled";
                return (
                  <div
                    key={system.id}
                    className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <SystemIcon system={system} size={16} />
                      <span className="truncate">{system.name || system.id}</span>
                      {isMultiTenancy && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Multi-tenancy
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isMultiTenancy && credential && (
                        <Badge
                          variant={credential.hasCredentials ? "default" : "secondary"}
                          className={`text-xs ${credential.hasCredentials ? "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30" : ""}`}
                        >
                          {credential.hasCredentials ? "Connected" : "Not connected"}
                        </Badge>
                      )}
                      {isMultiTenancy && !credential && (
                        <Badge variant="secondary" className="text-xs">
                          Not connected
                        </Badge>
                      )}
                      {!isMultiTenancy && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Shared
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {expanded &&
        systems.length > 0 &&
        systems.filter((s) => hasAllAccess || allowedSystemIds.has(s.id)).length === 0 && (
          <div className="border-t border-border/50 px-4 py-3 bg-background/50">
            <div className="text-xs text-muted-foreground text-center">
              No systems accessible (restrict access in edit dialog)
            </div>
          </div>
        )}
    </div>
  );
}

export function OrganizationView() {
  const config = useConfig();
  const { systems } = useSystems();
  const { toast } = useToast();
  const {
    members: orgMembers,
    isLoading: isMembersLoading,
    refetch: refetchMembers,
  } = useOrgMembers();
  const [endUsers, setEndUsers] = useState<EndUserWithCredentials[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<EndUserWithCredentials | null>(null);
  const [formData, setFormData] = useState<EndUserFormData>({
    externalId: "",
    email: "",
    name: "",
    allowedSystems: ["*"], // ['*'] = all systems allowed (explicit)
  });
  const [sendEmail, setSendEmail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSendEmail, setBulkSendEmail] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkAllowedSystems, setBulkAllowedSystems] = useState<string[]>(["*"]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get multi-tenancy systems for the form
  const multiTenancySystems = systems.filter((s) => s.multiTenancyMode === "enabled");

  const fetchEndUsers = async () => {
    setIsLoading(true);
    try {
      const token = tokenRegistry.getToken();
      const response = await fetch(`${config.apiEndpoint}/v1/end-users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 501) {
          // Multi-tenancy not available
          setEndUsers([]);
          return;
        }
        throw new Error("Failed to fetch end users");
      }

      const data = await response.json();
      const users: EndUserWithCredentials[] = data.data || [];

      // Fetch full details (including credentials) for each user
      const usersWithCredentials = await Promise.all(
        users.map(async (user) => {
          try {
            const detailResponse = await fetch(`${config.apiEndpoint}/v1/end-users/${user.id}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            if (detailResponse.ok) {
              const detailData = await detailResponse.json();
              return { ...user, credentials: detailData.data?.credentials || [] };
            }
          } catch {
            // Ignore fetch errors
          }
          return user;
        }),
      );

      setEndUsers(usersWithCredentials);
    } catch (error) {
      console.error("Failed to fetch end users:", error);
      toast({
        title: "Failed to fetch end users",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEndUsers();
  }, []);

  const generatePortalUrl = async (endUserId: string): Promise<string | null> => {
    try {
      const token = tokenRegistry.getToken();
      const response = await fetch(`${config.apiEndpoint}/v1/end-users/${endUserId}/portal-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to generate portal link");
      }

      const data = await response.json();
      return data.data?.portalUrl || null;
    } catch (error) {
      console.error("Failed to generate portal link:", error);
      toast({
        title: "Failed to generate portal link",
        description: "Please try again later",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleOpenPortal = async (endUserId: string) => {
    const portalUrl = await generatePortalUrl(endUserId);
    if (portalUrl) {
      window.open(portalUrl, "_blank");
    }
  };

  const handleSendPortalLink = async (endUserId: string) => {
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      const result = await client.sendPortalLink(endUserId);

      toast({
        title: "Email sent",
        description: `Portal link sent to ${result.recipient}`,
      });
    } catch (error) {
      console.error("Failed to send portal link:", error);
      toast({
        title: "Failed to send email",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive",
      });
    }
  };

  const handleCreateClick = () => {
    setEditingUser(null);
    setFormData({ externalId: "", email: "", name: "", allowedSystems: ["*"] });
    setSendEmail(false);
    setDialogOpen(true);
  };

  const handleBulkImport = async () => {
    setBulkImporting(true);
    try {
      const lines = bulkText.split("\n").filter((line) => line.trim());
      let successCount = 0;
      let failCount = 0;

      for (const line of lines) {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length < 1) continue;

        const [email, name, externalId] = parts;
        if (!email) continue;

        try {
          const token = tokenRegistry.getToken();
          const response = await fetch(`${config.apiEndpoint}/v1/end-users`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: email.trim(),
              name: name?.trim(),
              externalId: externalId?.trim(),
              allowedSystems: bulkAllowedSystems,
            }),
          });

          if (response.ok) {
            successCount++;
            // Send invitation email if requested
            if (bulkSendEmail) {
              const data = await response.json();
              const savedUser = data.data;
              if (savedUser?.id && savedUser?.email) {
                try {
                  await fetch(`${config.apiEndpoint}/v1/end-users/${savedUser.id}/invite`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                } catch {
                  // Email failed but user was created
                }
              }
            }
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      await fetchEndUsers(); // Refresh list

      setBulkImportOpen(false);
      setBulkText("");
      setBulkSendEmail(false);
      setBulkAllowedSystems(["*"]);
    } catch (error) {
      toast({
        title: "Bulk import failed",
        description: "Please check the format and try again",
        variant: "destructive",
      });
    } finally {
      setBulkImporting(false);
    }
  };

  const handleEditClick = (user: EndUserWithCredentials) => {
    setEditingUser(user);
    setFormData({
      externalId: user.externalId,
      email: user.email || "",
      name: user.name || "",
      allowedSystems: user.allowedSystems ?? [], // Default to no access if not set
    });
    setSendEmail(false);
    setDialogOpen(true);
  };

  const handleDeleteClick = async (endUserId: string) => {
    setIsDeleting(true);
    try {
      const token = tokenRegistry.getToken();
      const response = await fetch(`${config.apiEndpoint}/v1/end-users/${endUserId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete end user");
      }

      setEndUsers((prev) => prev.filter((u) => u.id !== endUserId));
    } catch (error) {
      console.error("Failed to delete end user:", error);
      toast({
        title: "Failed to delete end user",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };

  const handleSave = async (keepOpen = false) => {
    setIsSaving(true);
    try {
      const token = tokenRegistry.getToken();
      const response = await fetch(`${config.apiEndpoint}/v1/end-users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Only send externalId when editing (to identify the user)
          externalId: editingUser ? formData.externalId : undefined,
          email: formData.email.trim() || undefined,
          name: formData.name.trim() || undefined,
          allowedSystems: formData.allowedSystems || [],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save end user");
      }

      const data = await response.json();
      const savedUser = data.data;

      // Send invitation email if requested (only for new users with email)
      if (!editingUser && sendEmail && savedUser.email) {
        try {
          await fetch(`${config.apiEndpoint}/v1/end-users/${savedUser.id}/invite`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (emailError) {
          console.error("Failed to send invitation email:", emailError);
          toast({
            title: "User created but email failed",
            description: "The user was created but the invitation email could not be sent",
            variant: "destructive",
          });
        }
      }

      if (editingUser) {
        // Update existing user in list
        setEndUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? { ...u, ...savedUser } : u)),
        );
        setDialogOpen(false);
      } else {
        // Add new user to list
        setEndUsers((prev) => [savedUser, ...prev]);
        if (keepOpen) {
          // Reset form for another entry
          setFormData({ externalId: "", email: "", name: "", allowedSystems: ["*"] });
          setSendEmail(false);
        } else {
          setDialogOpen(false);
        }
      }
    } catch (error) {
      console.error("Failed to save end user:", error);
      toast({
        title: "Failed to save end user",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Organization</h1>
        </div>
        <Button
          onClick={() => {
            fetchEndUsers();
            refetchMembers();
          }}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Team Members Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold">Team Members</h2>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Admins and members who have access to this organization's dashboard.
        </p>
        {isMembersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : orgMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-dashed border-border/50 dark:border-border/70">
            No team members found.
          </div>
        ) : (
          <div className="space-y-3">
            {orgMembers.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-border/50 dark:border-border/70 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <UserIcon name={member.name} email={member.email} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {member.name || member.email || "Unknown user"}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                      {member.email && member.name && <span>{member.email}</span>}
                      <span>Joined {new Date(member.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs ${member.role === UserRole.ADMIN ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" : ""}`}
                >
                  {member.role === UserRole.ADMIN ? "Admin" : "Member"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* End Users Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h2 className="text-lg font-semibold">End Users</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setBulkImportOpen(true)} size="sm" variant="glass">
              <Upload className="h-4 w-4" />
              Bulk Import
            </Button>
            <Button onClick={handleCreateClick} size="sm" variant="glass">
              <Plus className="h-4 w-4" />
              New End User
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          External users who can run tools via the API and MCP.
        </p>

        {endUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-dashed border-border/50 dark:border-border/70">
            No end users yet. Create one to get started with multi-tenancy.
          </div>
        ) : (
          <div className="space-y-3">
            {endUsers.map((endUser) => (
              <EndUserRow
                key={endUser.id}
                endUser={endUser}
                systems={systems}
                onGeneratePortalUrl={generatePortalUrl}
                onOpenPortal={handleOpenPortal}
                onSendPortalLink={handleSendPortalLink}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>{editingUser ? "Edit End User" : "Create End User"}</DialogTitle>
              <DialogDescription>
                {editingUser
                  ? "Update the end user's information and system access."
                  : "Create a new end user for multi-tenancy."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="externalId">External ID</Label>
                  <Input
                    id="externalId"
                    value={formData.externalId}
                    disabled
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    The external ID cannot be changed.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <div className="flex items-center gap-2">
                  <UserIcon name={formData.name} email={formData.email} size="sm" />
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="John Doe"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                />
                {!editingUser && formData.email && (
                  <div className="flex items-center justify-between pt-2 px-1">
                    <label
                      htmlFor="sendEmail"
                      className="text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Send portal invitation email (link valid for 30 days)
                    </label>
                    <Switch
                      id="sendEmail"
                      checked={sendEmail}
                      onCheckedChange={(checked) => setSendEmail(checked)}
                    />
                  </div>
                )}
              </div>

              {/* System Access Section */}
              {systems.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base">System Access</Label>
                    <Button
                      type="button"
                      variant={formData.allowedSystems?.includes("*") ? "outline" : "default"}
                      size="sm"
                      onClick={() => {
                        if (formData.allowedSystems?.includes("*")) {
                          // Switch to restricted: start with all systems selected
                          setFormData((prev) => ({
                            ...prev,
                            allowedSystems: systems.map((s) => s.id),
                          }));
                        } else {
                          // Switch to all access
                          setFormData((prev) => ({ ...prev, allowedSystems: ["*"] }));
                        }
                      }}
                    >
                      {formData.allowedSystems?.includes("*") ? (
                        <>
                          <Shield className="h-4 w-4 mr-2" />
                          Restrict to Specific Systems
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4 mr-2" />
                          Allow All Systems
                        </>
                      )}
                    </Button>
                  </div>

                  {formData.allowedSystems?.includes("*") ? (
                    <div className="text-sm text-muted-foreground bg-green-500/10 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg flex items-center gap-2 border border-green-500/20">
                      <ShieldCheck className="h-5 w-5" />
                      <span>User has access to all systems</span>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                                <Checkbox
                                  checked={formData.allowedSystems.length === systems.length}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setFormData((prev) => ({
                                        ...prev,
                                        allowedSystems: systems.map((s) => s.id),
                                      }));
                                    } else {
                                      setFormData((prev) => ({ ...prev, allowedSystems: [] }));
                                    }
                                  }}
                                />
                              </th>
                              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                                System
                              </th>
                              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                                Type
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {systems.map((system) => {
                              const isChecked = formData.allowedSystems?.includes(system.id);
                              const isMultiTenancy = system.multiTenancyMode === "enabled";
                              return (
                                <tr key={system.id} className="border-t hover:bg-muted/30">
                                  <td className="px-3 py-2">
                                    <Checkbox
                                      id={`system-${system.id}`}
                                      checked={isChecked}
                                      onCheckedChange={(checked) => {
                                        setFormData((prev) => {
                                          const current = prev.allowedSystems.filter(
                                            (id) => id !== "*",
                                          );
                                          if (checked) {
                                            return {
                                              ...prev,
                                              allowedSystems: [...current, system.id],
                                            };
                                          } else {
                                            return {
                                              ...prev,
                                              allowedSystems: current.filter(
                                                (id) => id !== system.id,
                                              ),
                                            };
                                          }
                                        });
                                      }}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <label
                                      htmlFor={`system-${system.id}`}
                                      className="flex items-center gap-2 text-sm cursor-pointer"
                                    >
                                      <SystemIcon system={system} size={18} />
                                      <span>{system.name || system.id}</span>
                                    </label>
                                  </td>
                                  <td className="px-3 py-2">
                                    {isMultiTenancy ? (
                                      <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                        Multi-tenancy
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] px-2 py-0.5"
                                      >
                                        Shared
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              {!editingUser && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSave(true)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-1" />
                      Create & Add Another
                    </>
                  )}
                </Button>
              )}
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingUser ? (
                  "Update"
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkImportOpen} onOpenChange={setBulkImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Import End Users</DialogTitle>
            <DialogDescription>
              Add multiple end users at once. Enter one user per line in CSV format.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg font-mono">
                email, name (optional), external ID (optional)
              </div>
              <div className="text-xs text-muted-foreground">
                Example:
                <div className="mt-1 bg-muted/50 p-2 rounded font-mono text-[11px]">
                  user1@example.com, John Doe, user-123
                  <br />
                  user2@example.com, Jane Smith
                  <br />
                  user3@example.com
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-text">Users</Label>
              <Textarea
                id="bulk-text"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder=""
                className="min-h-[200px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {bulkText.split("\n").filter((l) => l.trim()).length} users will be imported
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 px-1">
              <label
                htmlFor="bulk-send-email"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Send portal invitation emails to all users
              </label>
              <Switch
                id="bulk-send-email"
                checked={bulkSendEmail}
                onCheckedChange={(checked) => setBulkSendEmail(checked)}
              />
            </div>

            {/* System Access Section */}
            {systems.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label>System Access</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (bulkAllowedSystems.includes("*")) {
                        setBulkAllowedSystems(systems.map((s) => s.id));
                      } else {
                        setBulkAllowedSystems(["*"]);
                      }
                    }}
                  >
                    {bulkAllowedSystems.includes("*") ? (
                      <>
                        <Shield className="h-3 w-3 mr-1" />
                        Restrict access
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Allow all
                      </>
                    )}
                  </Button>
                </div>

                {bulkAllowedSystems.includes("*") ? (
                  <div className="text-xs text-muted-foreground bg-green-500/10 text-green-700 dark:text-green-300 px-3 py-2 rounded-lg flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    All users will have access to all systems
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                    {systems.map((system) => {
                      const isChecked = bulkAllowedSystems.includes(system.id);
                      const isMultiTenancy = system.multiTenancyMode === "enabled";
                      return (
                        <div
                          key={system.id}
                          className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50"
                        >
                          <Checkbox
                            id={`bulk-system-${system.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setBulkAllowedSystems((prev) => {
                                const current = prev.filter((id) => id !== "*");
                                if (checked) {
                                  return [...current, system.id];
                                } else {
                                  return current.filter((id) => id !== system.id);
                                }
                              });
                            }}
                          />
                          <label
                            htmlFor={`bulk-system-${system.id}`}
                            className="flex items-center gap-2 text-sm cursor-pointer flex-1"
                          >
                            <SystemIcon system={system} size={16} />
                            <span className="truncate">{system.name || system.id}</span>
                            {isMultiTenancy && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Multi-tenancy
                              </Badge>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkImportOpen(false);
                setBulkText("");
                setBulkSendEmail(false);
                setBulkAllowedSystems(["*"]);
              }}
              disabled={bulkImporting}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkImport} disabled={!bulkText.trim() || bulkImporting}>
              {bulkImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Users
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

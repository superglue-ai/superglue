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
import { UserIcon } from "@/src/components/ui/user-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
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
import { useToast } from "@/src/hooks/use-toast";
import { useOrgMembers } from "@/src/hooks/use-org-members";
import { useJWTOrgInfos } from "@/src/hooks/use-jwt-org-infos";
import { useUpgradeModal } from "@/src/components/upgrade/UpgradeModalContext";
import { tokenRegistry } from "@/src/lib/token-registry";
import { createEESuperglueClient } from "@/src/lib/ee-superglue-client";
import type { EndUser, EndUserCredentialStatus, System } from "@superglue/shared";
import { UserRole } from "@superglue/shared";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  DoorOpen,
  ExternalLink,
  Loader2,
  Mail,
  MoreHorizontal,
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

function SystemAccessSelector({
  systems,
  selectedSystems,
  onSelectionChange,
  allAccessMessage = "User has access to all systems",
  idPrefix = "system",
}: {
  systems: System[];
  selectedSystems: string[];
  onSelectionChange: (systems: string[]) => void;
  allAccessMessage?: string;
  idPrefix?: string;
}) {
  const hasAllAccess = selectedSystems.includes("*");

  const toggleAllAccess = () => {
    if (hasAllAccess) {
      onSelectionChange(systems.map((s) => s.id));
    } else {
      onSelectionChange(["*"]);
    }
  };

  const toggleSystem = (systemId: string, checked: boolean) => {
    const current = selectedSystems.filter((id) => id !== "*");
    if (checked) {
      onSelectionChange([...current, systemId]);
    } else {
      onSelectionChange(current.filter((id) => id !== systemId));
    }
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(systems.map((s) => s.id));
    } else {
      onSelectionChange([]);
    }
  };

  if (systems.length === 0) return null;

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-base">System Access</Label>
        <Button
          type="button"
          variant={hasAllAccess ? "outline" : "default"}
          size="sm"
          onClick={toggleAllAccess}
        >
          {hasAllAccess ? (
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

      {hasAllAccess ? (
        <div className="text-sm text-muted-foreground bg-green-500/10 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg flex items-center gap-2 border border-green-500/20">
          <ShieldCheck className="h-5 w-5" />
          <span>{allAccessMessage}</span>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                    <Checkbox
                      checked={selectedSystems.length === systems.length}
                      onCheckedChange={(checked) => toggleAll(!!checked)}
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
                  const isChecked = selectedSystems.includes(system.id);
                  const isMultiTenancy = system.multiTenancyMode === "enabled";
                  return (
                    <tr key={system.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Checkbox
                          id={`${idPrefix}-${system.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => toggleSystem(system.id, !!checked)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <label
                          htmlFor={`${idPrefix}-${system.id}`}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <SystemIcon system={system} size={16} />
                          <span className="truncate">{system.name || system.id}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        {isMultiTenancy ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Multi-tenancy
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Shared</span>
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
  );
}

function EndUserTableRow({
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
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isCopyingLink, setIsCopyingLink] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const connectedCount = endUser.credentials?.filter((c) => c.hasCredentials).length || 0;
  const totalSystems = endUser.credentials?.length || 0;

  const hasAllAccess = endUser.allowedSystems?.includes("*") || false;
  const allowedSystemIds = new Set(endUser.allowedSystems || []);
  const accessibleSystems = systems.filter((s) => hasAllAccess || allowedSystemIds.has(s.id));

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpanded(!expanded)}>
        <TableCell className="w-[40px]">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <UserIcon name={endUser.name} email={endUser.email} size="sm" />
            <span className="font-medium truncate">
              {endUser.name || endUser.email || endUser.externalId}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">{endUser.email || "-"}</TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
          >
            End User
          </Badge>
        </TableCell>
        <TableCell>
          {hasAllAccess ? (
            <Badge
              variant="outline"
              className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
            >
              <ShieldCheck className="h-3 w-3 mr-1" />
              All
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              {allowedSystemIds.size}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          {totalSystems > 0 ? (
            <span className="text-sm text-muted-foreground">
              {connectedCount}/{totalSystems}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="glass" size="sm" className="h-8 px-2 text-xs">
                  <DoorOpen className="h-3 w-3 mr-1" />
                  Portal
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onOpenPortal(endUser.id)}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Portal
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    setIsCopyingLink(true);
                    const url = await onGeneratePortalUrl(endUser.id);
                    setIsCopyingLink(false);
                    if (url) {
                      await navigator.clipboard.writeText(url);
                      toast({
                        title: "Link copied",
                        description: "Portal link copied to clipboard",
                      });
                    }
                  }}
                  disabled={isCopyingLink}
                >
                  {isCopyingLink ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  Copy Link
                </DropdownMenuItem>
                {endUser.email && (
                  <DropdownMenuItem
                    onClick={async () => {
                      setIsSendingEmail(true);
                      await onSendPortalLink(endUser.id);
                      setIsSendingEmail(false);
                    }}
                    disabled={isSendingEmail}
                  >
                    {isSendingEmail ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Send via Email
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="glass" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(endUser)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete End User</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="text-sm text-muted-foreground">
                      Are you sure you want to delete{" "}
                      {endUser.name || endUser.email || endUser.externalId}? This will permanently
                      delete:
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>The end user account</li>
                        <li>All API keys associated with this user</li>
                        <li>All stored credentials for connected systems</li>
                      </ul>
                      <span className="block mt-2">This action cannot be undone.</span>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(endUser.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TableCell>
      </TableRow>
      {expanded && accessibleSystems.length > 0 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="p-0">
            <div className="px-4 py-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">System Access</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {accessibleSystems.map((system) => {
                  const credential = endUser.credentials?.find((c) => c.systemId === system.id);
                  const isMultiTenancy = system.multiTenancyMode === "enabled";
                  return (
                    <div
                      key={system.id}
                      className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg bg-background/50"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <SystemIcon system={system} size={16} />
                        <span className="truncate">{system.name || system.id}</span>
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
          </TableCell>
        </TableRow>
      )}
      {expanded && accessibleSystems.length === 0 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-3">
            No systems accessible
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function OrganizationView() {
  const config = useConfig();
  const { systems } = useSystems();
  const { toast } = useToast();
  const { isPersonalOrg } = useJWTOrgInfos();
  const { openUpgradeModal } = useUpgradeModal();
  const {
    members: allOrgMembers,
    isLoading: isMembersLoading,
    refetch: refetchMembers,
  } = useOrgMembers();

  // Check pro status from cookie
  const isPro =
    typeof document !== "undefined" &&
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("pro_status="))
      ?.split("=")[1] === "true";

  // Limit end users for Personal non-pro accounts
  const END_USER_LIMIT_FREE = 1;
  const isAtEndUserLimit = isPersonalOrg && !isPro;

  // Filter out superglue internal accounts
  const orgMembers = allOrgMembers.filter(
    (m) => !m.email?.endsWith("@superglue.ai") && !m.email?.endsWith("@superglue.cloud"),
  );
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
  const [bulkValidationErrors, setBulkValidationErrors] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // API key display state (shown after creating a new user)
  const [newUserApiKey, setNewUserApiKey] = useState<{ userName: string; apiKey: string } | null>(
    null,
  );

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
    // Check end user limit for Personal non-pro accounts
    if (isAtEndUserLimit && endUsers.length >= END_USER_LIMIT_FREE) {
      openUpgradeModal();
      return;
    }
    setEditingUser(null);
    setFormData({ externalId: "", email: "", name: "", allowedSystems: ["*"] });
    setSendEmail(false);
    setDialogOpen(true);
  };

  const handleBulkImport = async () => {
    // Validate all lines first
    const lines = bulkText.split("\n").filter((line) => line.trim());
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map((p) => p.trim());
      const email = parts[0];
      if (!email) {
        invalidLines.push(`Line ${i + 1}: Email is required`);
      } else if (!emailRegex.test(email)) {
        invalidLines.push(`Line ${i + 1}: Invalid email format "${email}"`);
      }
    }

    if (invalidLines.length > 0) {
      setBulkValidationErrors(invalidLines);
      return;
    }

    setBulkValidationErrors([]);
    setBulkImporting(true);
    try {
      let successCount = 0;
      let failCount = 0;

      for (const line of lines) {
        // Support comma, tab, and semicolon as delimiters
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
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

  const handleSave = async () => {
    // Require email for new users
    const email = formData.email.trim();
    if (!editingUser && !email) {
      toast({
        title: "Email required",
        description: "Please enter an email address for the end user",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const token = tokenRegistry.getToken();
      const isEditing = !!editingUser;

      const url = isEditing
        ? `${config.apiEndpoint}/v1/end-users/${editingUser.id}`
        : `${config.apiEndpoint}/v1/end-users`;

      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          externalId: isEditing ? undefined : formData.externalId || undefined,
          email: formData.email.trim() || undefined,
          name: formData.name.trim() || undefined,
          allowedSystems: formData.allowedSystems || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save end user");
      }

      const data = await response.json();
      const savedUser = data.data;

      // Send invitation email if requested (only for new users with email)
      if (!isEditing && sendEmail && savedUser.email) {
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

      if (isEditing) {
        // Update existing user in list
        setEndUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? { ...u, ...savedUser } : u)),
        );
        setDialogOpen(false);
      } else {
        // Add new user to list
        setEndUsers((prev) => [savedUser, ...prev]);
        setDialogOpen(false);

        // Show API key dialog if one was created
        if (savedUser.apiKey) {
          setNewUserApiKey({
            userName: savedUser.name || savedUser.email || savedUser.externalId,
            apiKey: savedUser.apiKey,
          });
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
      {/* Users Section - Combined Team Members and End Users */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Organization</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                fetchEndUsers();
                refetchMembers();
              }}
              variant="glass"
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="glass">
                  <Plus className="h-4 w-4" />
                  Add End User
                  {!isAtEndUserLimit && <ChevronDown className="h-4 w-4 ml-1" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCreateClick}>
                  <User className="h-4 w-4 mr-2" />
                  {isAtEndUserLimit ? "Add End User" : "Single User"}
                </DropdownMenuItem>
                {!isAtEndUserLimit && (
                  <DropdownMenuItem onClick={() => setBulkImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Bulk Import
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Admins and members have dashboard access. End users can run tools via API and MCP.
        </p>

        {isMembersLoading || isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : orgMembers.length === 0 && endUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-dashed border-border/50 dark:border-border/70">
            No users found.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="w-[200px]">User</TableHead>
                  <TableHead className="w-[200px]">Email</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[120px]">Systems</TableHead>
                  <TableHead className="w-[100px]">Connected</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Team Members */}
                {orgMembers.map((member) => (
                  <TableRow key={`member-${member.userId}`}>
                    <TableCell></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserIcon name={member.name} email={member.email} size="sm" />
                        <span className="font-medium truncate">
                          {member.name || member.email || "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{member.email || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${member.role === UserRole.ADMIN ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"}`}
                      >
                        {member.role === UserRole.ADMIN ? "Admin" : "Member"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        All
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        All
                      </Badge>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
                {/* End Users */}
                {endUsers.map((endUser) => (
                  <EndUserTableRow
                    key={`enduser-${endUser.id}`}
                    endUser={endUser}
                    systems={systems}
                    onGeneratePortalUrl={generatePortalUrl}
                    onOpenPortal={handleOpenPortal}
                    onSendPortalLink={handleSendPortalLink}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
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
                <Label htmlFor="email">
                  Email {!editingUser && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  required={!editingUser}
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

              <SystemAccessSelector
                systems={systems}
                selectedSystems={formData.allowedSystems}
                onSelectionChange={(selected) =>
                  setFormData((prev) => ({ ...prev, allowedSystems: selected }))
                }
                allAccessMessage="User has access to all systems"
                idPrefix="system"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
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
                onChange={(e) => {
                  setBulkText(e.target.value);
                  setBulkValidationErrors([]);
                }}
                placeholder=""
                className="min-h-[200px] font-mono text-xs"
              />
              {bulkValidationErrors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
                  <div className="font-medium mb-1">Validation errors:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    {bulkValidationErrors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {bulkValidationErrors.length > 5 && (
                      <li>...and {bulkValidationErrors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
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

            <SystemAccessSelector
              systems={systems}
              selectedSystems={bulkAllowedSystems}
              onSelectionChange={setBulkAllowedSystems}
              allAccessMessage="All users will have access to all systems"
              idPrefix="bulk-system"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkImportOpen(false);
                setBulkText("");
                setBulkSendEmail(false);
                setBulkAllowedSystems(["*"]);
                setBulkValidationErrors([]);
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

      {/* API Key Display Dialog */}
      <Dialog open={!!newUserApiKey} onOpenChange={(open) => !open && setNewUserApiKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End User Created</DialogTitle>
            <DialogDescription>
              An API key has been generated for {newUserApiKey?.userName}. Copy it now. It won't be
              shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input readOnly value={newUserApiKey?.apiKey || ""} className="font-mono text-sm" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (newUserApiKey?.apiKey) {
                      navigator.clipboard.writeText(newUserApiKey.apiKey);
                      toast({
                        title: "Copied to clipboard",
                        description: "The API key has been copied.",
                      });
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This key allows the end user to execute tools via REST API and MCP based on their
                permitted systems.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewUserApiKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

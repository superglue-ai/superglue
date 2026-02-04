"use client";

import { useSystems } from "@/src/app/systems-context";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { SystemIcon } from "@/src/components/ui/system-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useToast } from "@/src/hooks/use-toast";
import { composeUrl } from "@/src/lib/general-utils";
import { createOAuthErrorHandler } from "@/src/lib/oauth-utils";
import { SystemActionsMenu } from "@/src/components/systems/SystemActionsMenu";
import { SystemTemplatePicker } from "@/src/components/systems/SystemTemplatePicker";
import { useSystemPickerModal } from "@/src/components/systems/SystemPickerModalContext";
import type { System } from "@superglue/shared";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  Key,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Search,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type SortColumn = "id" | "urlHost" | "updatedAt";
type SortDirection = "asc" | "desc";

export default function SystemsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { systems, loading: initialLoading, isRefreshing, refreshSystems } = useSystems();
  const { openSystemPicker } = useSystemPickerModal();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const currentSystems = useMemo(() => {
    let filtered =
      systems?.filter((system) => {
        if (!system) return false;
        if (debouncedSearchTerm) {
          const searchLower = debouncedSearchTerm.toLowerCase();
          const searchableText = [system.id, system.urlHost, system.urlPath]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!searchableText.includes(searchLower)) return false;
        }
        return true;
      }) || [];

    filtered = [...filtered].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortColumn) {
        case "id":
          return dir * a.id.localeCompare(b.id);
        case "urlHost":
          return dir * (a.urlHost || "").localeCompare(b.urlHost || "");
        case "updatedAt":
          return (
            dir *
            (new Date(a.updatedAt || a.createdAt).getTime() -
              new Date(b.updatedAt || b.createdAt).getTime())
          );
        default:
          return 0;
      }
    });

    return filtered;
  }, [systems, debouncedSearchTerm, sortColumn, sortDirection]);

  const handleEdit = (system: System) => {
    router.push(`/systems/${encodeURIComponent(system.id)}`);
  };

  const handleAdd = () => {
    openSystemPicker();
  };

  const handleRefresh = useCallback(async () => {
    await refreshSystems();
  }, [refreshSystems]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "updatedAt" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  if (initialLoading && systems.length === 0) {
    return (
      <div className="p-8 max-w-none w-full h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (systems.length === 0) {
    return (
      <div className="p-8 max-w-none w-full h-full flex flex-col overflow-hidden">
        <SystemTemplatePicker showHeader={true} className="flex-1" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-none w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 gap-2 flex-shrink-0">
        <h1 className="text-2xl font-bold">Systems</h1>
        <div className="flex gap-4">
          <Button className="rounded-xl" onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add System
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 flex-shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or endpoint..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="border rounded-lg flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[60px]"></TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("id")}
              >
                <div className="flex items-center">
                  System ID
                  <SortIcon column="id" />
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("urlHost")}
              >
                <div className="flex items-center">
                  API Endpoint
                  <SortIcon column="urlHost" />
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center">Auth Status</div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("updatedAt")}
              >
                <div className="flex items-center">
                  Updated At
                  <SortIcon column="updatedAt" />
                </div>
              </TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRefresh}
                        className="transition-transform"
                      >
                        <RotateCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Refresh Systems</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialLoading && systems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground inline-block" />
                </TableCell>
              </TableRow>
            ) : currentSystems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <span>No results found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              currentSystems.map((sys) => {
                const badge = getAuthBadge(sys);
                const colorClasses = {
                  blue: "text-blue-600 dark:text-blue-300 bg-blue-500/10",
                  amber: "text-amber-800 dark:text-amber-300 bg-amber-500/10",
                  green: "text-green-800 dark:text-green-300 bg-green-500/10",
                };

                return (
                  <TableRow key={sys.id} className="hover:bg-secondary">
                    <TableCell className="w-[60px]">
                      <div className="flex items-center justify-center">
                        <SystemIcon system={sys} size={16} />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="truncate">{sys.id}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{sys.id}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <span className="text-sm text-muted-foreground truncate block">
                        {composeUrl(sys.urlHost, sys.urlPath) || "No API endpoint"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs ${colorClasses[badge.color]} px-2 py-0.5 rounded flex items-center gap-1 w-fit whitespace-nowrap`}
                      >
                        {badge.icon === "clock" ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <Key className="h-3 w-3" />
                        )}
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {sys.updatedAt
                        ? new Date(sys.updatedAt).toLocaleDateString()
                        : sys.createdAt
                          ? new Date(sys.createdAt).toLocaleDateString()
                          : "-"}
                    </TableCell>
                    <TableCell className="w-[140px]">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="glass"
                          size="sm"
                          onClick={() => handleEdit(sys)}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <SystemActionsMenu system={sys} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

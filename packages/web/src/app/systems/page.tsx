"use client";

import { useSystems, useInvalidateSystems } from "@/src/queries/systems";
import { Button } from "@/src/components/ui/button";
import { EnvironmentBadge, type EnvironmentType } from "@/src/components/ui/environment-label";
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
import { createOAuthErrorHandler } from "@/src/lib/oauth-utils";
import { SystemActionsMenu } from "@/src/components/systems/SystemActionsMenu";
import { SystemTemplatePicker } from "@/src/components/systems/SystemTemplatePicker";
import { useSystemPickerModal } from "@/src/components/systems/SystemPickerModalContext";
import type { System } from "@superglue/shared";
import { getSystemAuthStatus } from "@superglue/shared";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/src/lib/general-utils";

export const getAuthLabel = (system: System): string => {
  const status = getSystemAuthStatus(system);

  if (status.authType === "none") {
    return "Not set";
  }

  if (status.authType === "oauth") {
    return "OAuth";
  }

  if (status.authType === "connection_string") {
    return "Connection";
  }

  return "API Key";
};

type SortColumn = "id" | "url" | "updatedAt" | "environment";
type SortDirection = "asc" | "desc";

interface SystemWithEnvInfo extends System {
  envState: EnvironmentType;
  linkedDevSystem?: System;
  linkedProdSystem?: System;
}

export default function SystemsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { systems, loading: initialLoading, isRefreshing, isTunnelConnected } = useSystems();
  const { openSystemPicker } = useSystemPickerModal();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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

  // Compute environment state for each system and group linked systems
  const systemsWithEnvInfo = useMemo((): SystemWithEnvInfo[] => {
    if (!systems) return [];

    // With composite key model, systems are linked by having the same ID with different environments
    // Group systems by ID to find linked pairs
    const systemsById = new Map<string, System[]>();
    for (const sys of systems) {
      const existing = systemsById.get(sys.id) || [];
      existing.push(sys);
      systemsById.set(sys.id, existing);
    }

    const result: SystemWithEnvInfo[] = [];
    const processedIds = new Set<string>();

    for (const sys of systems) {
      // Skip if we've already processed this ID (for linked systems, we show the prod one)
      if (processedIds.has(sys.id)) continue;

      const linkedSystems = systemsById.get(sys.id) || [sys];
      const devSystem = linkedSystems.find((s) => s.environment === "dev");
      const prodSystem = linkedSystems.find((s) => s.environment === "prod");

      let envState: EnvironmentType;
      let linkedDevSystem: System | undefined;
      let linkedProdSystem: System | undefined;
      let displaySystem: System;

      // Database constraint ensures environment is always 'dev' or 'prod' (NOT NULL DEFAULT 'prod')
      if (devSystem && prodSystem) {
        envState = "both";
        displaySystem = prodSystem;
        linkedDevSystem = devSystem;
      } else if (prodSystem) {
        envState = "prod";
        displaySystem = prodSystem;
      } else if (devSystem) {
        envState = "dev";
        displaySystem = devSystem;
      } else {
        // Unreachable given DB constraints, but TypeScript needs exhaustive handling
        envState = "prod";
        displaySystem = sys;
      }

      processedIds.add(sys.id);

      result.push({
        ...displaySystem,
        envState,
        linkedDevSystem,
        linkedProdSystem,
      });
    }

    return result;
  }, [systems]);

  const currentSystems = useMemo(() => {
    let filtered = systemsWithEnvInfo.filter((system) => {
      if (!system) return false;

      if (debouncedSearchTerm) {
        const searchLower = debouncedSearchTerm.toLowerCase();
        const searchableText = [system.id, system.name, system.url]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchableText.includes(searchLower)) return false;
      }
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortColumn) {
        case "id":
          return dir * (a.name || a.id).localeCompare(b.name || b.id);
        case "url":
          return dir * (a.url || "").localeCompare(b.url || "");
        case "updatedAt":
          return (
            dir *
            (new Date(a.updatedAt || a.createdAt).getTime() -
              new Date(b.updatedAt || b.createdAt).getTime())
          );
        case "environment":
          const envOrder = { none: 0, dev: 1, prod: 2, both: 3 };
          return dir * (envOrder[a.envState] - envOrder[b.envState]);
        default:
          return 0;
      }
    });

    return filtered;
  }, [systemsWithEnvInfo, debouncedSearchTerm, sortColumn, sortDirection]);

  const handleEdit = (system: System) => {
    // Always pass the environment parameter to ensure we edit the correct one
    const envParam = system.environment ? `?env=${system.environment}` : "";
    router.push(`/systems/${encodeURIComponent(system.id)}${envParam}`);
  };

  const handleAdd = () => {
    openSystemPicker();
  };

  const invalidateSystems = useInvalidateSystems();

  const handleRefresh = useCallback(async () => {
    await invalidateSystems();
  }, [invalidateSystems]);

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
        <div className="flex items-center gap-4">
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
                  System Name
                  <SortIcon column="id" />
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("url")}
              >
                <div className="flex items-center">
                  System Endpoint
                  <SortIcon column="url" />
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("environment")}
              >
                <div className="flex items-center">
                  Environments
                  <SortIcon column="environment" />
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center">Auth</div>
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
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50 ml-auto"
                  title="Refresh Systems"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialLoading && systems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground inline-block" />
                </TableCell>
              </TableRow>
            ) : currentSystems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <span>No results found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              currentSystems.map((sys) => {
                const authLabel = getAuthLabel(sys);

                return (
                  <TableRow key={`${sys.id}-${sys.environment}`} className="hover:bg-secondary">
                    <TableCell className="w-[60px]">
                      <div className="flex items-center justify-center">
                        <SystemIcon system={sys} size={16} />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px]">
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="min-w-0 truncate">{sys.name || sys.id}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{sys.name || sys.id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {sys.tunnel && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-muted-foreground bg-muted/50 whitespace-nowrap">
                                  <Shield className="h-3 w-3" />
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${isTunnelConnected(sys.tunnel.tunnelId) ? "bg-green-500" : "bg-gray-400"}`}
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  Private System ({sys.tunnel.tunnelId}) -{" "}
                                  {isTunnelConnected(sys.tunnel.tunnelId)
                                    ? "Connected"
                                    : "Disconnected"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <span className="text-sm text-muted-foreground truncate block">
                        {sys.url || "No API endpoint"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <EnvironmentBadge type={sys.envState} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {authLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {sys.updatedAt
                        ? new Date(sys.updatedAt).toLocaleDateString()
                        : sys.createdAt
                          ? new Date(sys.createdAt).toLocaleDateString()
                          : "-"}
                    </TableCell>
                    <TableCell className="w-[180px]">
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

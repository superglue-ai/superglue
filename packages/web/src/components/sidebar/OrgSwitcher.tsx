"use client";

import { Check, Loader2, User, Building2, Building, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import {
  getUserOrganizations,
  switchOrganization,
} from "@/src/app/actions/organizations/organizations";
import { OrganizationMembership } from "@/src/app/actions/organizations/types";
import { useSupabaseClient } from "@/src/app/config-context";
import { toast } from "@/src/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface OrgSwitcherProps {
  currentOrgId: string;
  currentOrgName: string;
}

export function OrgSwitcher({ currentOrgId, currentOrgName }: OrgSwitcherProps) {
  const [orgs, setOrgs] = useState<OrganizationMembership[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [switchingToOrgId, setSwitchingToOrgId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const supabase = useSupabaseClient();
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showLoadingUI, setShowLoadingUI] = useState(false);

  async function handleOpenChange(open: boolean) {
    setIsOpen(open);

    if (open && !isLoading) {
      setIsLoading(true);

      if (!hasLoadedOnce) {
        setHasLoadedOnce(true);
        setShowLoadingUI(true);
      }

      try {
        const result = await getUserOrganizations();
        setOrgs(result);
      } catch (error) {
        console.error("Failed to load organizations:", error);
        toast({
          title: "Error",
          description: "Failed to load organizations",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
        setShowLoadingUI(false);
      }
    }
  }

  async function handleSwitchOrg(orgId: string) {
    if (switchingToOrgId) return;

    if (orgId === currentOrgId) {
      setIsOpen(false);
      return;
    }

    try {
      setSwitchingToOrgId(orgId);
      await switchOrganization(orgId);

      // force refresh session to fix stale org JWT edge cases
      await supabase.auth.refreshSession();

      window.location.href = "/";
    } catch (error) {
      console.error("Error switching org:", error);
      setSwitchingToOrgId(null);

      toast({
        title: "Error",
        description: "Failed to switch organization",
        variant: "destructive",
      });
    }
  }

  if (!supabase || !currentOrgName) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center px-3 py-2.5 text-sm text-muted-foreground hover:bg-gradient-to-br hover:from-muted/40 hover:to-muted/20 dark:hover:from-muted/40 dark:hover:to-muted/20 hover:text-foreground rounded-xl transition-all duration-200">
          {currentOrgName === "Personal" ? (
            <User className="h-4 w-4 mr-3 flex-shrink-0" />
          ) : (
            <Building2 className="h-4 w-4 mr-3 flex-shrink-0" />
          )}
          <span className="truncate flex-1 text-left">{currentOrgName}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 ml-auto flex-shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="w-52" sideOffset={4}>
        {showLoadingUI ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading...</div>
        ) : orgs.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No other organizations
          </div>
        ) : (
          <>
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Switch organization
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {orgs
              .filter((org) => org.id !== currentOrgId)
              .map((org) => (
                <DropdownMenuItem key={org.id} onClick={() => handleSwitchOrg(org.id)}>
                  {org.displayName === "Personal" ? (
                    <User className="h-4 w-4 mr-2 flex-shrink-0" />
                  ) : (
                    <Building className="h-4 w-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="truncate flex-1">{org.displayName}</span>
                  <div className="w-4 h-4 flex-shrink-0">
                    {switchingToOrgId === org.id && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem onClick={() => handleSwitchOrg(currentOrgId!)}>
              {currentOrgName === "Personal" ? (
                <User className="h-4 w-4 mr-2 flex-shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 mr-2 flex-shrink-0" />
              )}
              <span className="truncate flex-1 font-medium">{currentOrgName}</span>
              <div className="w-4 h-4 flex-shrink-0">
                {switchingToOrgId === currentOrgId ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </div>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

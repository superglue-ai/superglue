"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { useConfig } from "./config-context";

interface OrgContextValue {
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  roleIds: string[];
  isAdmin: boolean;
  isEnterprise: boolean;
  isPro: boolean;
  isLoadingBilling: boolean;
  canManageMembers: boolean;
}

const OrgContext = createContext<OrgContextValue | null>(null);

// In OSS, the personal/default org is represented as the empty string.
// Treat empty string as a resolved org ID; only null/undefined mean "no org context".
export function hasResolvedOrgId(orgId: string | null | undefined): orgId is string {
  return orgId !== null && orgId !== undefined;
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrg must be used within OrgProvider");
  }
  return context;
}

export function useOrgOptional() {
  return useContext(OrgContext);
}

interface OrgProviderProps {
  children: ReactNode;
}

export function OrgProvider({ children }: OrgProviderProps) {
  const config = useConfig();
  const session = config.serverSession ?? {
    userId: "oss-admin",
    email: "",
    orgId: "",
    orgName: "Personal",
    orgStatus: "free",
  };

  const value = useMemo<OrgContextValue>(
    () => ({
      orgId: session.orgId,
      orgName: session.orgName,
      userId: session.userId,
      userEmail: session.email,
      roleIds: ["admin"],
      isAdmin: true,
      isEnterprise: false,
      isPro: false,
      isLoadingBilling: false,
      canManageMembers: false,
    }),
    [session],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

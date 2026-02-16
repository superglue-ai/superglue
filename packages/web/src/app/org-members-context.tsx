"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getOrgMembers } from "@/src/app/actions/organizations/organizations";
import type { OrgMember } from "@/src/app/actions/organizations/types";

interface OrgMembersContextValue {
  members: OrgMember[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const OrgMembersContext = createContext<OrgMembersContextValue | null>(null);

export function useOrgMembers() {
  const context = useContext(OrgMembersContext);
  if (!context) {
    throw new Error("useOrgMembers must be used within OrgMembersProvider");
  }
  return context;
}

export function OrgMembersProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getOrgMembers();
      setMembers(data);
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to fetch org members:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  return (
    <OrgMembersContext.Provider value={{ members, isLoading, error, refetch: fetchMembers }}>
      {children}
    </OrgMembersContext.Provider>
  );
}

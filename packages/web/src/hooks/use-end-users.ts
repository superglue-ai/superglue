"use client";

import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import type { EndUser } from "@superglue/shared";
import { useCallback, useEffect, useState } from "react";

export function useEndUsers() {
  const [endUsers, setEndUsers] = useState<EndUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = useConfig();

  const fetchEndUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = tokenRegistry.getToken();
      const response = await fetch(`${config.apiEndpoint}/v1/end-users?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
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
      setEndUsers(data.data || []);
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to fetch end users:", err);
    } finally {
      setIsLoading(false);
    }
  }, [config.apiEndpoint]);

  useEffect(() => {
    fetchEndUsers();
  }, [fetchEndUsers]);

  // Helper to get end user by ID
  const getEndUserById = useCallback(
    (id: string | null): EndUser | undefined => {
      if (!id) return undefined;
      return endUsers.find((u) => u.id === id);
    },
    [endUsers],
  );

  // Helper to get display name for an end user
  const getEndUserDisplayName = useCallback(
    (id: string | null): string | undefined => {
      const user = getEndUserById(id);
      if (!user) return undefined;
      return user.name || user.email || user.externalId;
    },
    [getEndUserById],
  );

  return {
    endUsers,
    isLoading,
    error,
    refetch: fetchEndUsers,
    getEndUserById,
    getEndUserDisplayName,
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { getUserEmailById, getUserEmailsByIds } from "@/src/app/actions/user-lookup";

/**
 * Hook to fetch a single user's email by their user ID.
 * Uses server action to call Supabase Admin API.
 */
export function useUserEmail(userId: string | null | undefined): {
  email: string | null;
  isLoading: boolean;
} {
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setEmail(null);
      setIsLoading(false);
      return;
    }

    let stale = false;
    setIsLoading(true);
    getUserEmailById(userId)
      .then((result) => {
        if (!stale) setEmail(result);
      })
      .catch((error) => {
        console.error("Error fetching user email:", error);
        if (!stale) setEmail(null);
      })
      .finally(() => {
        if (!stale) setIsLoading(false);
      });

    return () => {
      stale = true;
    };
  }, [userId]);

  return { email, isLoading };
}

// Cache for user emails to avoid repeated lookups
const emailCache = new Map<string, string | null>();

/**
 * Hook that provides a cached user email lookup function.
 * Useful when you need to look up multiple users or want manual control.
 */
export function useUserLookup(): {
  getUserEmail: (userId: string) => Promise<string | null>;
  getUserEmails: (userIds: string[]) => Promise<Record<string, string | null>>;
  clearCache: () => void;
} {
  const getUserEmail = useCallback(async (userId: string): Promise<string | null> => {
    if (!userId) return null;

    // Check cache first
    if (emailCache.has(userId)) {
      return emailCache.get(userId) ?? null;
    }

    // Fetch from server
    const email = await getUserEmailById(userId);
    emailCache.set(userId, email);
    return email;
  }, []);

  const getUserEmails = useCallback(
    async (userIds: string[]): Promise<Record<string, string | null>> => {
      const uniqueIds = [...new Set(userIds.filter(Boolean))];
      const results: Record<string, string | null> = {};
      const uncachedIds: string[] = [];

      // Check cache first
      for (const userId of uniqueIds) {
        if (emailCache.has(userId)) {
          results[userId] = emailCache.get(userId) ?? null;
        } else {
          uncachedIds.push(userId);
        }
      }

      // Fetch uncached from server
      if (uncachedIds.length > 0) {
        const fetched = await getUserEmailsByIds(uncachedIds);
        for (const [userId, email] of Object.entries(fetched)) {
          emailCache.set(userId, email);
          results[userId] = email;
        }
      }

      return results;
    },
    [],
  );

  const clearCache = useCallback(() => {
    emailCache.clear();
  }, []);

  return { getUserEmail, getUserEmails, clearCache };
}

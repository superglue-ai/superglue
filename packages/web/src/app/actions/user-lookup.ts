"use server";

import { createAdminAuthClient } from "@/src/supabase/adminServer";

/**
 * Server action to fetch user email by user ID.
 * Uses Supabase Admin API which requires service role key.
 */
export async function getUserEmailById(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    const adminAuth = await createAdminAuthClient();
    const { data, error } = await adminAuth.getUserById(userId);

    if (error || !data?.user) {
      return null;
    }

    return data.user.email ?? null;
  } catch (error) {
    console.error("Error fetching user email:", error);
    return null;
  }
}

/**
 * Server action to fetch multiple user emails by user IDs.
 * Returns a map of userId -> email.
 */
export async function getUserEmailsByIds(
  userIds: string[],
): Promise<Record<string, string | null>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const results: Record<string, string | null> = {};

  // Fetch in parallel
  await Promise.all(
    uniqueIds.map(async (userId) => {
      results[userId] = await getUserEmailById(userId);
    }),
  );

  return results;
}

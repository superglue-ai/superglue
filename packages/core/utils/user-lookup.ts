import { UserInfo } from "@superglue/shared";
import { logMessage } from "./logs.js";

/**
 * Fetches user email from Supabase by user ID using the Admin API.
 * Returns null if user not found or on error.
 */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.PRIV_SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logMessage("error", "Missing Supabase configuration for user lookup");
    return null;
  }

  try {
    const url = `${SUPABASE_URL}/auth/v1/admin/users/${userId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        logMessage("debug", `User not found: ${userId}`);
        return null;
      }
      logMessage("error", `Failed to fetch user: ${response.statusText}`);
      return null;
    }

    const user = await response.json();
    return user.email ?? null;
  } catch (error) {
    logMessage("error", `Error fetching user email: ${error}`);
    return null;
  }
}

/**
 * Fetches user info (id and email) from Supabase by user ID.
 * Returns null if user not found or on error.
 */
export async function getUserInfoById(userId: string): Promise<UserInfo | null> {
  const email = await getUserEmailById(userId);
  if (email === null) {
    return null;
  }
  return { id: userId, email };
}

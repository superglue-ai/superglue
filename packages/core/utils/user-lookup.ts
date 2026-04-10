import { getDataStore } from "../datastore/datastore.js";
import { isEEDataStore } from "../datastore/ee/types.js";

/**
 * Check if a tool config references sg_auth_email and resolve the user's email if so.
 * Returns the existing email if already known, skips the DB lookup if not needed.
 */
export async function resolveUserEmailIfNeeded({
  toolConfig,
  userId,
  existingEmail,
}: {
  toolConfig: unknown;
  userId?: string;
  existingEmail?: string;
}): Promise<string | undefined> {
  if (existingEmail) return existingEmail;
  if (!userId) return undefined;

  // Only hit the DB if the tool config actually references sg_auth_email
  try {
    const serialized = JSON.stringify(toolConfig);
    if (!serialized.includes("sg_auth_email")) return undefined;
  } catch {
    return undefined;
  }

  const dataStore = getDataStore();
  if (!isEEDataStore(dataStore)) return undefined;

  const user = await dataStore.getAuthUser({ userId });
  return user?.email ?? undefined;
}

import { SupabaseClient } from "@supabase/supabase-js";
import { getOrgIdFromJWT } from "../lib/jwt-utils";

export interface ApiKey {
  id: string;
  key: string;
  created_by_user_id: string;
  created_by_email?: string | null;
  user_id: string;
  org_id: string;
  is_active: boolean;
  created_at: string;
  // EE: Permission fields
  is_restricted: boolean;
  allowed_tools: string[]; // ['*'] means all tools allowed
}

export const fetchApiKeys = async (supabase: SupabaseClient) => {
  try {
    // CRITICAL: Only trust JWT claims for active_org_id, never user.app_metadata
    // The custom auth hook validates org membership at token issuance and injects
    // active_org_id into the JWT. This ensures every request uses validated, current
    // org membership that's cryptographically signed and verified by the backend.
    // For details: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const orgId = getOrgIdFromJWT(session.access_token);
    if (!orgId) {
      console.error("No org_id found in JWT");
      return;
    }

    const { data: keys, error } = await supabase
      .from("sg_api_keys_with_email")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return keys as ApiKey[];
  } catch (error) {
    console.error("Error fetching API keys: ", error);
  }
};

export interface CreateApiKeyOptions {
  mode?: "frontend" | "backend";
  isRestricted?: boolean;
  allowedTools?: string[];
}

export const createApiKey = async (
  supabase: SupabaseClient,
  options: CreateApiKeyOptions = {},
): Promise<ApiKey | undefined> => {
  const { mode = "backend", isRestricted = false, allowedTools = ["*"] } = options;
  try {
    // CRITICAL: Only trust JWT claims for org_id, never user.app_metadata
    // The custom auth hook validates org membership at token issuance and injects
    // active_org_id into the JWT. This ensures every request uses validated, current
    // org membership that's cryptographically signed and verified by the backend.
    // See fetchApiKeys above for full explanation.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error("No session found");
      return;
    }

    const orgId = getOrgIdFromJWT(session.access_token);
    if (!orgId) {
      console.error("No org_id found in JWT");
      return;
    }

    // Get current user info to store with the key
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const newKey = crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await supabase
      .from("sg_superglue_api_keys")
      .insert([
        {
          key: newKey,
          is_active: true,
          mode: mode,
          org_id: orgId,
          is_restricted: isRestricted,
          allowed_tools: allowedTools,
          created_by_user_id: user?.id ?? null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as ApiKey;
  } catch (error) {
    console.error("Error creating API key: ", error);
  }
};

export const deleteApiKey = async (id: string, supabase: SupabaseClient): Promise<boolean> => {
  try {
    const { error } = await supabase.from("sg_superglue_api_keys").delete().eq("id", id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting API key:", error);
    return false;
  }
};

export const toggleApiKey = async (
  id: string,
  currentState: boolean,
  supabase: SupabaseClient,
): Promise<ApiKey | undefined> => {
  try {
    const { data, error } = await supabase
      .from("sg_superglue_api_keys")
      .update({ is_active: !currentState })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as ApiKey;
  } catch (error) {
    console.error("Error toggling API key:", error);
  }
};

export interface UpdateApiKeyOptions {
  isRestricted?: boolean;
  allowedTools?: string[];
}

export const updateApiKey = async (
  id: string,
  updates: UpdateApiKeyOptions,
  supabase: SupabaseClient,
): Promise<ApiKey | undefined> => {
  try {
    const updateData: Record<string, unknown> = {};
    if (updates.isRestricted !== undefined) {
      updateData.is_restricted = updates.isRestricted;
    }
    if (updates.allowedTools !== undefined) {
      updateData.allowed_tools = updates.allowedTools;
    }

    const { data, error } = await supabase
      .from("sg_superglue_api_keys")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as ApiKey;
  } catch (error) {
    console.error("Error updating API key:", error);
  }
};

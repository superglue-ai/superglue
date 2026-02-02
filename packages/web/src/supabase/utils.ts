import { User } from "@supabase/supabase-js";
import { SEED_CONFIG } from "@superglue/shared";
import { createAdminClient } from "./adminServer";

export const createOrgIdForUser = async (userData: User): Promise<string> => {
  const slug = `org-for-user-${userData.email}`;
  const adminClient = await createAdminClient();

  // create org
  const { data: newOrg, error: newOrgError } = await adminClient
    .from("sg_organizations")
    .insert({ slug: slug, display_name: "Personal" })
    .select("id")
    .single();

  if (newOrgError) {
    throw new Error("Failed to create organization");
  }

  // add user to org by creating a junction table entry
  const { error: junctionError } = await adminClient.from("sg_user_organizations").insert({
    user_id: userData.id,
    org_id: newOrg.id,
    role: "admin",
  });

  if (junctionError) {
    throw new Error("Failed to create user-org relationship: " + junctionError.message);
  }

  const { error: updateAdminError } = await adminClient.auth.admin.updateUserById(userData.id, {
    app_metadata: {
      active_org_id: newOrg.id,
    },
  });

  if (updateAdminError) {
    throw new Error("Failed to update user with org_id: " + updateAdminError.message);
  }

  return newOrg.id;
};

export async function seedNewOrg(accessToken: string): Promise<void> {
  if (SEED_CONFIG.systems.length === 0 && SEED_CONFIG.tools.length === 0) {
    return;
  }

  const apiEndpoint = process.env.API_ENDPOINT;

  if (!apiEndpoint) {
    throw new Error("API_ENDPOINT is not defined");
  }

  const response = await fetch(`${apiEndpoint}/v1/seed`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to seed org:", response.status, errorText);
    throw new Error(`Failed to seed org: ${response.status}`);
  }

  const result = await response.json();
  console.log("Seed result:", result);
}

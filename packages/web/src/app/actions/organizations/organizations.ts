"use server";

import { createClient } from "@/src/supabase/server";
import { createAdminAuthClient } from "@/src/supabase/adminServer";
import { OrganizationMembership, OrgMember } from "./types";
import { mapUserRole } from "@superglue/shared";
import { getOrgIdFromJWT } from "@/src/lib/jwt-utils";

export async function getUserOrganizations(): Promise<OrganizationMembership[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    throw new Error("Unauthorized");
  }

  const { data: orgs, error: queryError } = await supabase
    .from("sg_user_organizations")
    .select(
      `
      org_id,
      role,
      created_at,
      sg_organizations!inner (
        id,
        display_name,
        slug
      )
    `,
    )
    .eq("user_id", user.id);

  if (queryError) {
    throw new Error(`Failed to fetch organizations: ${queryError.message}`);
  }

  return (
    orgs?.map((currentOrg: any) => ({
      id: currentOrg.org_id,
      displayName: currentOrg.sg_organizations.display_name,
      slug: currentOrg.sg_organizations.slug,
      role: mapUserRole(currentOrg.role),
      createdAt: currentOrg.created_at,
    })) || []
  );
}

export async function switchOrganization(orgId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    throw new Error("Unauthorized");
  }

  const { data: membership } = await supabase
    .from("sg_user_organizations")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (!membership) {
    throw new Error("User is not a member of this organization");
  }

  const adminClient = await createAdminAuthClient();
  const { error } = await adminClient.updateUserById(user.id, {
    app_metadata: {
      active_org_id: orgId,
    },
  });

  if (error) {
    throw new Error(`Failed to switch organization: ${error.message}`);
  }
}

export async function getOrgMembers(): Promise<OrgMember[]> {
  const supabase = await createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (!session || sessionError) {
    throw new Error("Unauthorized");
  }

  // Get org_id from JWT (trusted source)
  const orgId = getOrgIdFromJWT(session.access_token);
  if (!orgId) {
    throw new Error("No organization found in session");
  }

  // Fetch all members of the current org
  const { data: memberships, error: queryError } = await supabase
    .from("sg_user_organizations")
    .select("user_id, role, created_at")
    .eq("org_id", orgId);

  if (queryError) {
    throw new Error(`Failed to fetch org members: ${queryError.message}`);
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  // Use admin client to get user details (email, name)
  const adminClient = await createAdminAuthClient();
  const members: OrgMember[] = [];

  for (const membership of memberships as Array<{
    user_id: string;
    role: string;
    created_at: string;
  }>) {
    try {
      const { data: userData, error: userError } = await adminClient.getUserById(
        membership.user_id,
      );
      if (userError || !userData?.user) {
        // Still include the member even if we can't get their details
        members.push({
          userId: membership.user_id,
          email: null,
          name: null,
          role: mapUserRole(membership.role),
          createdAt: membership.created_at,
        });
      } else {
        members.push({
          userId: membership.user_id,
          email: userData.user.email ?? null,
          name: (userData.user.user_metadata?.name as string) ?? null,
          role: mapUserRole(membership.role),
          createdAt: membership.created_at,
        });
      }
    } catch {
      // Include member with minimal info on error
      members.push({
        userId: membership.user_id,
        email: null,
        name: null,
        role: mapUserRole(membership.role),
        createdAt: membership.created_at,
      });
    }
  }

  // Sort: admins first, then by created_at
  return members.sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (a.role !== "admin" && b.role === "admin") return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

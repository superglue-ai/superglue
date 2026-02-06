"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/supabase/server";
import { createOrgIdForUser, seedNewOrg } from "@/src/supabase/utils";
import { SignUpWithPasswordCredentials, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/src/lib/database.types";

export type LoginResult = {
  error?: string;
};

export async function login(formData: FormData): Promise<LoginResult> {
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const provider = formData.get("provider") as string;
  const redirectHost = process.env.SUPERGLUE_APP_URL || "https://app.superglue.cloud";

  switch (provider) {
    case "google":
      return await handleGoogleLogin(supabase, redirectHost);
    case "github":
      return await handleGithubLogin(supabase, redirectHost);
    case "email":
      return await handleEmailLogin(supabase, formData);
    default:
      return { error: "Invalid provider" };
  }
}

async function handleGithubLogin(
  supabase: SupabaseClient<Database>,
  redirectHost: string,
): Promise<LoginResult> {
  const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${redirectHost}/auth/callback`,
    },
  });

  if (oauthError) {
    return { error: oauthError.message };
  }

  if (oauthData.url) {
    redirect(oauthData.url);
  }

  return { error: "Failed to get OAuth URL" };
}

async function handleGoogleLogin(
  supabase: SupabaseClient<Database>,
  redirectHost: string,
): Promise<LoginResult> {
  const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${redirectHost}/auth/callback`,
    },
  });

  if (oauthError) {
    return { error: oauthError.message };
  }

  if (oauthData.url) {
    redirect(oauthData.url);
  }

  return { error: "Failed to get OAuth URL" };
}

async function handleEmailLogin(
  supabase: SupabaseClient<Database>,
  formData: FormData,
): Promise<LoginResult> {
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { data: emailLoginData, error: emailLoginError } =
    await supabase.auth.signInWithPassword(data);
  if (emailLoginError) {
    return { error: emailLoginError.message };
  }

  if (!emailLoginData?.user) {
    return { error: "No user data returned" };
  }

  let isNewOrg = false;
  try {
    const hasActiveOrgId = !!emailLoginData.user.app_metadata?.active_org_id;
    const hasLegacyOrgId = !!emailLoginData.user.app_metadata?.org_id; // for legacy users

    if (emailLoginData.user.email && !hasActiveOrgId && !hasLegacyOrgId) {
      await createOrgIdForUser(emailLoginData.user);
      isNewOrg = true;
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to setup user account" };
  }

  // Seed new orgs with default systems and tools
  if (isNewOrg) {
    await supabase.auth.refreshSession();
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.access_token) {
      try {
        await seedNewOrg(sessionData.session.access_token);
      } catch (error) {
        console.error("Failed to seed new org:", error);
      }
    }
  }

  return {};
}

export async function signup(formData: FormData): Promise<LoginResult> {
  const supabase = await createClient();
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  } as SignUpWithPasswordCredentials;

  const { data: signupData, error: signupError } = await supabase.auth.signUp(data);
  if (signupError) {
    return { error: signupError.message };
  }

  if (!signupData?.user?.id || !signupData?.user?.email) {
    return { error: "No user data returned" };
  }

  await createOrgIdForUser(signupData.user);

  // Refresh session to get updated JWT with org info, then seed
  await supabase.auth.refreshSession();
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.access_token) {
    try {
      await seedNewOrg(sessionData.session.access_token);
    } catch (error) {
      console.error("Failed to seed new org:", error);
      // Don't fail signup if seeding fails
    }
  }

  return {};
}

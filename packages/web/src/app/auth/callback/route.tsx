import { createClient } from "@/src/supabase/server";
import { createOrgIdForUser, seedNewOrg } from "@/src/supabase/utils";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const mode = searchParams.get("mode");
  console.log("auth callback next", next);

  const redirectHost =
    process.env.NODE_ENV === "development"
      ? `http://localhost:3001`
      : `https://app.superglue.cloud`;

  if (!code) {
    return NextResponse.redirect(
      `${redirectHost}/login?error=${encodeURIComponent("No authorization code provided")}`,
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error("Auth Callback Error: " + error.message);
    }

    const user = await supabase.auth.getUser();
    console.log("Processing Auth Callback for user", user.data.user.id);

    const hasActiveOrgId = !!user.data.user.app_metadata?.active_org_id;
    const hasLegacyOrgId = !!user.data.user.app_metadata?.org_id;

    let isNewOrg = false;
    if (user.data?.user?.id && user.data?.user?.email && !hasActiveOrgId && !hasLegacyOrgId) {
      await createOrgIdForUser(user.data.user);
      isNewOrg = true;

      // refresh session to get updated JWT with org info
      await supabase.auth.refreshSession();
    }

    if (isNewOrg) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        await seedNewOrg(sessionData.session.access_token);
      }
    }

    if (mode === "tab-close") {
      return NextResponse.redirect(`${redirectHost}/auth/popup-close`);
    }

    return NextResponse.redirect(`${redirectHost}${next}`);
  } catch (error) {
    console.error("auth callback error", error);

    return NextResponse.redirect(
      `${redirectHost}/login?error=${encodeURIComponent(error.message)}`,
    );
  }
}

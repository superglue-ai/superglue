"use client";
import posthog, { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useSupabaseClient } from "./config-context";

let posthogClient: PostHog;

export function CSPostHogProvider({ children }: { children: any }) {
  const disable = process.env.DISABLE_TELEMETRY === "true";
  if (disable) {
    return <>{children}</>;
  }
  if (posthogClient) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }
  const supabase = useSupabaseClient();

  useEffect(() => {
    if (typeof window === "undefined" || disable) return;
    // Initialize PostHog
    posthogClient = posthog.init("phc_89mcVkZ9osPaFQwTp3oFA2595ne95OSNk47qnhqCCbE", {
      api_host: "https://d22ze2hfwgrlye.cloudfront.net",
      ui_host: "https://us.posthog.com",
      person_profiles: "always",
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
          password: true,
        },
      },
    });

    // Only set up auth tracking if Supabase is configured
    if (!supabase) {
      return;
    }

    // Check initial auth state
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        posthog.identify(data.user.email, {
          id: data.user.id,
          email: data.user.email,
          org_id: data.user.app_metadata?.org_id,
          sb_created_at: new Date(data.user.created_at).getTime(),
          auth_provider: data.user.app_metadata?.provider,
        });
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        posthog.identify(session.user.email);
      } else if (event === "SIGNED_OUT") {
        posthog.reset();
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}

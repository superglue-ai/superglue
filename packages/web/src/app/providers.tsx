"use client";
import posthog, { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import type { ServerSession } from "./config-context";

let posthogClient: PostHog;

export function CSPostHogProvider({
  children,
  serverSession,
}: {
  children: any;
  serverSession: ServerSession | null;
}) {
  const disable = process.env.DISABLE_TELEMETRY === "true";

  useEffect(() => {
    if (typeof window === "undefined" || disable || posthogClient) return;
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

    // Identify user from server session — no extra getSession() call needed
    if (serverSession) {
      posthog.identify(serverSession.email, {
        id: serverSession.userId,
        email: serverSession.email,
      });
    }
  }, []);

  if (disable) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}

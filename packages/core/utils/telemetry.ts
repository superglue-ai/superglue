import { PostHog } from "posthog-node";
import { server_defaults } from "../default.js";
import { logMessage } from "./logs.js";

// Privacy-preserving session id for anonymous telemetry
export const sessionId = crypto.randomUUID();

export const isDebug = process.env.DEBUG === "true";
export const isSelfHosted = process.env.RUNS_ON_SUPERGLUE_CLOUD !== "true";
export const isTelemetryDisabled = process.env.DISABLE_TELEMETRY === "true";

export const telemetryClient =
  !isTelemetryDisabled && !isDebug
    ? new PostHog(server_defaults.posthog.apiKey, {
        host: server_defaults.posthog.host,
        enableExceptionAutocapture: true,
      })
    : null;

if (telemetryClient) {
  logMessage(
    "info",
    "superglue uses telemetry to understand how many users are using the platform. See self-hosting guide for more info.",
  );
}

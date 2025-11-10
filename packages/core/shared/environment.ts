import { logMessage } from "../utils/logs.js";

export function validateEnvironment() {
  if (!process.env.START_SCHEDULER_SERVER) {
    logMessage(
      "warn",
      "START_SCHEDULER_SERVER is not set defaulting to false.",
    );
  }

  if (!process.env.API_PORT) {
    logMessage("warn", "API_PORT is not set defaulting to 3002.");
  }

  if (!process.env.GRAPHQL_PORT) {
    logMessage("warn", "GRAPHQL_PORT is not set defaulting to 3000.");
  }

  if (
    process.env.LLM_PROVIDER?.toUpperCase() !== "OPENAI" &&
    !process.env.OPENAI_API_KEY
  ) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  if (
    process.env.LLM_PROVIDER?.toUpperCase() === "GEMINI" &&
    !process.env.GEMINI_API_KEY
  ) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  if (
    process.env.LLM_PROVIDER?.toUpperCase() === "ANTHROPIC" &&
    !process.env.ANTHROPIC_API_KEY
  ) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  if (!process.env.AUTH_TOKEN && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(
      "AUTH_TOKEN is not set and no other authentication provider is configured.",
    );
  }

  if (
    process.env.DATASTORE_TYPE === "postgres" &&
    (!process.env.POSTGRES_HOST ||
      !process.env.POSTGRES_PORT ||
      !process.env.POSTGRES_USERNAME ||
      !process.env.POSTGRES_PASSWORD ||
      !process.env.POSTGRES_DB)
  ) {
    throw new Error(
      "POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USERNAME, POSTGRES_PASSWORD, and POSTGRES_DB are not set.",
    );
  }
}

import { logMessage } from "../utils/logs.js";

export function validateEnvironment() {
  if (!process.env.START_SCHEDULER_SERVER) {
    logMessage("warn", "START_SCHEDULER_SERVER is not set defaulting to false.");
  }

  if (!process.env.API_PORT) {
    logMessage("warn", "API_PORT is not set defaulting to 3002.");
  }

  if (process.env.LLM_PROVIDER?.toUpperCase() !== "OPENAI" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  if (process.env.LLM_PROVIDER?.toUpperCase() === "GEMINI" && !process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  if (process.env.LLM_PROVIDER?.toUpperCase() === "ANTHROPIC" && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  if (
    process.env.LLM_PROVIDER?.toUpperCase() === "VERTEX" &&
    !process.env.VERTEX_API_KEY &&
    !(process.env.VERTEX_CLIENT_EMAIL && process.env.VERTEX_PRIVATE_KEY) &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    throw new Error(
      "Vertex AI requires one of: VERTEX_API_KEY (Gemini only), VERTEX_CLIENT_EMAIL + VERTEX_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }

  if (!process.env.TAVILY_API_KEY) {
    logMessage("warn", "TAVILY_API_KEY is not set. Web search functionality will be unavailable.");
  }

  if (
    process.env.LLM_PROVIDER?.toUpperCase() === "BEDROCK" &&
    (!process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY ||
      !process.env.AWS_REGION)
  ) {
    throw new Error(
      "AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION must be set when using BEDROCK provider.",
    );
  }

  if (!process.env.AUTH_TOKEN && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("AUTH_TOKEN is not set and no other authentication provider is configured.");
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

import { logMessage } from "../utils/logs.js";

export function validateEnvironment() {
  if (!process.env.API_PORT) {
    logMessage('warn', 'API_PORT is not set defaulting to 3002.');
  }

  if (!process.env.GRAPHQL_PORT) {
    logMessage('warn', 'GRAPHQL_PORT is not set defaulting to 3000.');
  }

  if ((process.env.LLM_PROVIDER !== 'OPENAI') && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  if ((process.env.LLM_PROVIDER === 'GEMINI') && !process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }

  if ((process.env.LLM_PROVIDER === 'ANTHROPIC') && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }

  if (!process.env.AUTH_TOKEN && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('AUTH_TOKEN is not set and no other authentication provider is configured.');
  }
}

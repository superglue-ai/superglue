import { NextRequest } from "next/server";

/**
 * Authenticates API requests using Bearer token
 * Validates against AUTH_TOKEN env var
 */
export async function authenticateNextJSApiRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!token) {
    return null;
  }

  // If AUTH_TOKEN is set, validate against it
  if (process.env.AUTH_TOKEN) {
    return token === process.env.AUTH_TOKEN ? token : null;
  }

  // If no AUTH_TOKEN is set, accept any token (for local dev)
  return token;
}

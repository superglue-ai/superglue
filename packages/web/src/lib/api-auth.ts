import { NextRequest } from "next/server";

export interface AuthContext {
  token: string;
  backendUrl: string;
}

export async function authenticateNextJSApiRequest(
  request: NextRequest,
): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  // Check for cookie-based auth first (user entered their own credentials)
  const cookieApiUrl = request.cookies.get("superglue_api_url")?.value;
  if (cookieApiUrl) {
    // Cookie-based auth: use URL and token from user's cookies
    return {
      token,
      backendUrl: decodeURIComponent(cookieApiUrl),
    };
  }

  // Server-managed auth: validate token against AUTH_TOKEN (server-side only, never exposed to browser)
  const envToken = process.env.AUTH_TOKEN;
  if (!envToken) {
    // No server auth configured and no cookie auth - reject
    return null;
  }

  if (token !== envToken) return null;

  const backendUrl = process.env.API_ENDPOINT || "http://localhost:3002";
  return {
    token,
    backendUrl,
  };
}

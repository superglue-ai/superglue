import { NextRequest } from "next/server";

export async function authenticateNextJSApiRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  const authToken = process.env.AUTH_TOKEN || process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY;
  return token === authToken ? token : null;
}

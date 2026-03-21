import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

export async function authenticateNextJSApiRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  const authToken = process.env.AUTH_TOKEN || process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY;
  if (!authToken) return null;

  const tokenBuf = Buffer.from(token);
  const authBuf = Buffer.from(authToken);
  if (tokenBuf.length !== authBuf.length) return null;

  return timingSafeEqual(tokenBuf, authBuf) ? token : null;
}

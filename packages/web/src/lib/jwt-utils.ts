import { decodeJwt } from "jose";
import type { SuperglueJWTClaims } from "./auth";

export function decodeJWTPayload(token: string): SuperglueJWTClaims | null {
  if (!token.includes(".")) {
    return null;
  }

  try {
    return decodeJwt(token) as unknown as SuperglueJWTClaims;
  } catch (error: unknown) {
    return null;
  }
}

export function getOrgInfoFromJWT(token: string): { orgId: string | null } {
  const payload = decodeJWTPayload(token);
  return { orgId: payload?.orgId || null };
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { SupabaseJWTAuthManager } from "./supabase-jwt-auth-manager.js";

describe("SupabaseJWTAuthManager", () => {
  const mockEnv = {
    SUPABASE_JWT_SECRET: "test-secret-key-with-at-least-32-chars",
    NEXT_PUBLIC_SUPABASE_URL: "http://test.supabase.co",
  };
  let authManager: SupabaseJWTAuthManager;

  beforeEach(() => {
    process.env = { ...mockEnv };
    authManager = new SupabaseJWTAuthManager();
  });

  const createToken = async (payload: any) => {
    const secret = new TextEncoder().encode(mockEnv.SUPABASE_JWT_SECRET);
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(`${mockEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`)
      .setExpirationTime("2h")
      .sign(secret);
  };

  it("should authenticate valid JWT with complete metadata", async () => {
    const token = await createToken({
      sub: "user-123",
      app_metadata: {
        active_org_id: "org-456",
        active_org_name: "Test Org",
        active_org_role: "admin",
      },
    });

    const result = await authManager.authenticate(token);

    expect(result).toEqual({
      success: true,
      userId: "user-123",
      orgId: "org-456",
      orgName: "Test Org",
      orgRole: "admin",
    });
  });

  it("should authenticate valid JWT without optional org fields", async () => {
    const token = await createToken({
      sub: "user-123",
      app_metadata: {
        active_org_id: "org-456",
      },
    });

    const result = await authManager.authenticate(token);

    expect(result).toEqual({
      success: true,
      userId: "user-123",
      orgId: "org-456",
      orgName: undefined,
      orgRole: undefined,
    });
  });

  it("should fail authentication when JWT secret is missing", async () => {
    process.env.SUPABASE_JWT_SECRET = "";

    const result = await authManager.authenticate("any-token");

    expect(result).toEqual({ success: false, orgId: "" });
  });

  it("should fail authentication when token is invalid", async () => {
    const result = await authManager.authenticate("invalid-token");

    expect(result).toEqual({ success: false, orgId: "" });
  });

  it("should fail authentication when userId is missing", async () => {
    const token = await createToken({
      app_metadata: {
        active_org_id: "org-456",
      },
    });

    const result = await authManager.authenticate(token);

    expect(result).toEqual({ success: false, orgId: "" });
  });

  it("should fail authentication when orgId is missing", async () => {
    const token = await createToken({
      sub: "user-123",
      app_metadata: {},
    });

    const result = await authManager.authenticate(token);

    expect(result).toEqual({ success: false, orgId: "" });
  });

  it("should fail authentication when app_metadata is missing", async () => {
    const token = await createToken({
      sub: "user-123",
    });

    const result = await authManager.authenticate(token);

    expect(result).toEqual({ success: false, orgId: "" });
  });

  it("should fail authentication when token has wrong issuer", async () => {
    const secret = new TextEncoder().encode(mockEnv.SUPABASE_JWT_SECRET);
    const token = await new SignJWT({
      sub: "user-123",
      app_metadata: {
        active_org_id: "org-456",
      },
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("http://wrong-issuer.com")
      .setExpirationTime("2h")
      .sign(secret);

    const result = await authManager.authenticate(token);

    expect(result).toEqual({ success: false, orgId: "" });
  });

  it("should fail authentication when token is expired", async () => {
    const secret = new TextEncoder().encode(mockEnv.SUPABASE_JWT_SECRET);
    const token = await new SignJWT({
      sub: "user-123",
      app_metadata: {
        active_org_id: "org-456",
      },
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(`${mockEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`)
      .setExpirationTime("0s") // Already expired
      .sign(secret);

    const result = await authManager.authenticate(token);

    expect(result).toEqual({ success: false, orgId: "" });
  });
});

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateNextJSApiRequest, tokensMatchConstantTime } from "./api-auth";

function createRequest(options: {
  authorization?: string;
  cookieApiUrl?: string;
}): NextRequest {
  const headers = new Headers();
  if (options.authorization) {
    headers.set("authorization", options.authorization);
  }

  const request = new NextRequest("http://localhost/api/agent/chat", { headers });

  if (options.cookieApiUrl !== undefined) {
    vi.spyOn(request.cookies, "get").mockImplementation((name: string) => {
      if (name === "superglue_api_url") {
        return { name, value: options.cookieApiUrl! };
      }
      return undefined;
    });
  }

  return request;
}

describe("tokensMatchConstantTime", () => {
  it("returns true for matching tokens", () => {
    expect(tokensMatchConstantTime("secret-token", "secret-token")).toBe(true);
  });

  it("returns false for mismatched tokens of equal length", () => {
    expect(tokensMatchConstantTime("secret-token", "secret-tokex")).toBe(false);
  });

  it("returns false when token lengths differ", () => {
    expect(tokensMatchConstantTime("short", "much-longer-token")).toBe(false);
  });
});

describe("authenticateNextJSApiRequest", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns null when authorization header is missing", async () => {
    const result = await authenticateNextJSApiRequest(createRequest({}));
    expect(result).toBeNull();
  });

  it("returns null when bearer token does not match AUTH_TOKEN", async () => {
    process.env.AUTH_TOKEN = "expected-secret";

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer wrong-secret" }),
    );

    expect(result).toBeNull();
  });

  it("returns auth context when bearer token matches AUTH_TOKEN", async () => {
    process.env.AUTH_TOKEN = "expected-secret";
    process.env.API_ENDPOINT = "http://api.example:3002";

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer expected-secret" }),
    );

    expect(result).toEqual({
      token: "expected-secret",
      backendUrl: "http://api.example:3002",
    });
  });

  it("uses default backend URL when API_ENDPOINT is unset", async () => {
    process.env.AUTH_TOKEN = "expected-secret";
    delete process.env.API_ENDPOINT;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer expected-secret" }),
    );

    expect(result).toEqual({
      token: "expected-secret",
      backendUrl: "http://localhost:3002",
    });
  });

  it("returns null when AUTH_TOKEN is unset and cookie auth is absent", async () => {
    delete process.env.AUTH_TOKEN;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer any-token" }),
    );

    expect(result).toBeNull();
  });

  it("prefers cookie-based auth without validating AUTH_TOKEN", async () => {
    process.env.AUTH_TOKEN = "server-secret";

    const result = await authenticateNextJSApiRequest(
      createRequest({
        authorization: "Bearer user-token",
        cookieApiUrl: encodeURIComponent("http://custom-backend:4000"),
      }),
    );

    expect(result).toEqual({
      token: "user-token",
      backendUrl: "http://custom-backend:4000",
    });
  });

  it("returns null for malformed cookie auth values", async () => {
    const request = createRequest({
      authorization: "Bearer user-token",
      cookieApiUrl: "%E0%A4%A",
    });

    const result = await authenticateNextJSApiRequest(request);
    expect(result).toBeNull();
  });

  it("accepts case-insensitive bearer scheme", async () => {
    process.env.AUTH_TOKEN = "expected-secret";

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "bearer expected-secret" }),
    );

    expect(result?.token).toBe("expected-secret");
  });
});

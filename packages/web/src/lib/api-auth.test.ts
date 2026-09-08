import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const timingSafeEqualMock = vi.hoisted(() => vi.fn());

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return {
    ...actual,
    timingSafeEqual: timingSafeEqualMock,
  };
});

import { authenticateNextJSApiRequest } from "./api-auth";

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

describe("authenticateNextJSApiRequest", () => {
  const originalEnv = process.env;
  const validToken = "1234567890";

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const crypto = await vi.importActual<typeof import("crypto")>("crypto");
    timingSafeEqualMock.mockReset();
    timingSafeEqualMock.mockImplementation((a: Buffer, b: Buffer) => crypto.timingSafeEqual(a, b));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns null when authorization header is missing", async () => {
    const result = await authenticateNextJSApiRequest(createRequest({}));
    expect(result).toBeNull();
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });

  it("returns null for malformed authorization headers", async () => {
    process.env.AUTH_TOKEN = validToken;

    await expect(
      authenticateNextJSApiRequest(createRequest({ authorization: "Basic 1234567890" })),
    ).resolves.toBeNull();
    await expect(
      authenticateNextJSApiRequest(createRequest({ authorization: "Token 1234567890" })),
    ).resolves.toBeNull();
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });

  it("returns null for empty bearer tokens", async () => {
    process.env.AUTH_TOKEN = validToken;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer " }),
    );

    expect(result).toBeNull();
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });

  it("returns null when bearer token does not match AUTH_TOKEN", async () => {
    process.env.AUTH_TOKEN = validToken;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer 0000000000" }),
    );

    expect(result).toBeNull();
    expect(timingSafeEqualMock).toHaveBeenCalledOnce();
  });

  it("returns null on a first-character mismatch", async () => {
    process.env.AUTH_TOKEN = validToken;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer 0234567890" }),
    );

    expect(result).toBeNull();
    expect(timingSafeEqualMock).toHaveBeenCalledOnce();
  });

  it("returns null on a later-character mismatch with equal length", async () => {
    process.env.AUTH_TOKEN = validToken;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer 1234567899" }),
    );

    expect(result).toBeNull();
    expect(timingSafeEqualMock).toHaveBeenCalledOnce();
  });

  it("returns null for different-length tokens without calling timingSafeEqual", async () => {
    process.env.AUTH_TOKEN = validToken;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer short" }),
    );

    expect(result).toBeNull();
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });

  it("compares AUTH_TOKEN with timingSafeEqual for equal-length tokens", async () => {
    process.env.AUTH_TOKEN = validToken;

    await authenticateNextJSApiRequest(
      createRequest({ authorization: `Bearer ${validToken}` }),
    );

    expect(timingSafeEqualMock).toHaveBeenCalledOnce();
    const [provided, expected] = timingSafeEqualMock.mock.calls[0];
    expect(Buffer.from(validToken).equals(provided)).toBe(true);
    expect(Buffer.from(validToken).equals(expected)).toBe(true);
  });

  it("returns auth context when bearer token matches AUTH_TOKEN", async () => {
    process.env.AUTH_TOKEN = validToken;
    process.env.API_ENDPOINT = "http://api.example:3002";

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: `Bearer ${validToken}` }),
    );

    expect(result).toEqual({
      token: validToken,
      backendUrl: "http://api.example:3002",
    });
  });

  it("uses default backend URL when API_ENDPOINT is unset", async () => {
    process.env.AUTH_TOKEN = validToken;
    delete process.env.API_ENDPOINT;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: `Bearer ${validToken}` }),
    );

    expect(result).toEqual({
      token: validToken,
      backendUrl: "http://localhost:3002",
    });
  });

  it("returns null when AUTH_TOKEN is unset and cookie auth is absent", async () => {
    delete process.env.AUTH_TOKEN;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: "Bearer any-token" }),
    );

    expect(result).toBeNull();
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });

  it("prefers cookie-based auth without validating AUTH_TOKEN", async () => {
    process.env.AUTH_TOKEN = validToken;

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
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });

  it("returns null for malformed cookie auth values", async () => {
    const request = createRequest({
      authorization: "Bearer user-token",
      cookieApiUrl: "%E0%A4%A",
    });

    const result = await authenticateNextJSApiRequest(request);
    expect(result).toBeNull();
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });

  it("accepts case-insensitive bearer scheme", async () => {
    process.env.AUTH_TOKEN = validToken;

    const result = await authenticateNextJSApiRequest(
      createRequest({ authorization: `bearer ${validToken}` }),
    );

    expect(result?.token).toBe(validToken);
  });
});

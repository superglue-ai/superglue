import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { apiKey, codeVerifier } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });

    // Set httpOnly cookie with API key and optional PKCE code_verifier
    const cookieData = JSON.stringify({
      apiKey,
      ...(codeVerifier && { codeVerifier }),
    });

    response.cookies.set("oauth_session", cookieData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 300, // 5 minutes
      path: "/api/auth/callback",
    });

    return response;
  } catch (error) {
    console.error("Init OAuth error:", error);
    return NextResponse.json({ error: "Failed to initialize OAuth" }, { status: 500 });
  }
}

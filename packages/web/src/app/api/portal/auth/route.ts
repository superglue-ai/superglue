/**
 * EE: Portal Token Validation
 *
 * Validates a portal token and returns session token for the end-user portal.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Call the backend to validate the token
    const apiEndpoint =
      process.env.API_ENDPOINT || `http://localhost:${process.env.API_PORT || "3002"}`;
    const response = await fetch(`${apiEndpoint}/v1/portal/validate-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Invalid token" }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();

    // Return session token and user info
    return NextResponse.json({
      success: true,
      sessionToken: data.sessionToken,
      endUser: data.endUser,
    });
  } catch (error) {
    console.error("Portal auth error:", error);
    return NextResponse.json({ error: "Failed to validate token" }, { status: 500 });
  }
}

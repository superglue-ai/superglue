"use server";

import { AgentClient } from "@/src/lib/agent/agent-client";
import { authenticateNextJSApiRequest } from "@/src/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function POST(request: NextRequest) {
  let client: AgentClient | null = null;

  try {
    const token = await authenticateNextJSApiRequest(request);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing API key" },
        { status: 401 },
      );
    }

    const body = await request.json();

    client = new AgentClient({
      token,
      graphqlEndpoint: process.env.GRAPHQL_ENDPOINT!,
      apiEndpoint: process.env.API_ENDPOINT,
      abortSignal: request.signal,
    });

    try {
      client.validateRequest(body);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Agent request validation failed." },
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of client!.streamResponse(body)) {
            if (request.signal.aborted) {
              break;
            }
            try {
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));
            } catch {
              break;
            }
          }
          try {
            controller.close();
          } catch {}
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            try {
              controller.close();
            } catch {}
            return;
          }
          console.error("Streaming error:", error);
          try {
            const errorData = `data: ${JSON.stringify({
              type: "error",
              content: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
            controller.close();
          } catch {}
        } finally {
          client?.disconnect();
        }
      },
    });

    return new Response(readable, { headers: SSE_HEADERS });
  } catch (error) {
    console.error("Chat API error:", error);
    client?.disconnect();
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

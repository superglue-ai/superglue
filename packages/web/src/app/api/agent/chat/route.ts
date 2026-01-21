"use server";

import { AgentClient, ToolSet } from "@/src/lib/agent/agent-client";
import { generateInitialContext, injectContextIntoMessages } from "@/src/lib/agent/agent-context";
import { authenticateNextJSApiRequest } from "@/src/lib/api-auth";
import { Message, SuperglueClient } from "@superglue/shared";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const token = await authenticateNextJSApiRequest(request);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing API key" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      messages: Array<Message>;
      filePayloads?: Record<string, any>;
      toolSet?: ToolSet;
    };
    let { messages, filePayloads } = body;
    const toolSet = (body.toolSet ?? "agent") as ToolSet;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    // Always inject context into first user message (frontend doesn't preserve it)
    const superglueClient = new SuperglueClient({
      endpoint: process.env.GRAPHQL_ENDPOINT!,
      apiKey: token,
    });
    const context = await generateInitialContext(superglueClient);
    messages = injectContextIntoMessages(messages, context);

    // Get abort signal from request to handle client disconnection
    const abortSignal = request.signal;

    const client = new AgentClient(token, filePayloads, abortSignal, toolSet);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of client.streamLLMResponse(messages)) {
            // Check if client disconnected
            if (abortSignal.aborted) {
              break;
            }
            try {
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));
            } catch (enqueueError) {
              break;
            }
          }
          try {
            controller.close();
          } catch {}
        } catch (error) {
          // Don't log abort errors - they're expected
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
          } catch (closeError) {}
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

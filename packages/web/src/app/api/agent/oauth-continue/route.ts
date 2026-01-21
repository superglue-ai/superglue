"use server";

import { AgentClient } from "@/src/lib/agent/agent-client";
import { authenticateNextJSApiRequest } from "@/src/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";
import { Message } from "@superglue/shared";

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

    const { messages, toolCallId, systemData, error, filePayloads } = (await request.json()) as {
      messages: Array<Message>;
      toolCallId: string;
      systemData?: any;
      error?: string;
      filePayloads?: Record<string, any>;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    if (!toolCallId) {
      return NextResponse.json({ error: "Missing toolCallId" }, { status: 400 });
    }

    const client = new AgentClient(token, filePayloads);

    // Create different messages based on success or error
    let oauthCompletionMessage: Message;

    if (error) {
      // OAuth failed - ask LLM to analyze and write status update
      oauthCompletionMessage = {
        id: `oauth-error-${Date.now()}`,
        content: `OAuth authentication failed with the following error: "${error}"

System details: ${systemData ? JSON.stringify(systemData) : "N/A"}

Please analyze this error and write a status update message to the user (1-3 sentences) explaining what likely went wrong. Most commonly this is because the user could not authenticate successfully, but it could also be an issue with the OAuth credentials (client_id, client_secret, auth_url, token_url, scopes). Check if the system credentials look correct and provide helpful guidance.`,
        role: "user",
        timestamp: new Date(),
      };
    } else if (systemData) {
      // OAuth succeeded - create system
      oauthCompletionMessage = {
        id: `oauth-completion-${Date.now()}`,
        content: `OAuth authentication completed successfully! 

IMPORTANT CONTEXT: The previous create_system tool call was paused for OAuth authentication - NO system was actually created yet. You must now CREATE a new system from scratch using the create_system tool.

Please create the system "${systemData.name}" now using these exact updated credentials that include the OAuth access token: ${JSON.stringify(systemData)}.

This is a CREATE operation, not a modify operation. Use the create_system tool with all the provided data.`,
        role: "user",
        timestamp: new Date(),
      };
    } else {
      return NextResponse.json({ error: "Missing systemData or error" }, { status: 400 });
    }

    // Add OAuth completion message to conversation
    const messagesWithOAuth = [...messages, oauthCompletionMessage];

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of client.streamLLMResponse(messagesWithOAuth)) {
            const data = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
          controller.close();
        } catch (error) {
          console.error("OAuth continuation streaming error:", error);
          try {
            if (!controller.desiredSize) {
              return;
            }
            const errorData = `data: ${JSON.stringify({
              type: "error",
              content: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
            controller.close();
          } catch (closeError) {
            console.error("Error closing controller:", closeError);
          }
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
    console.error("OAuth continuation API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

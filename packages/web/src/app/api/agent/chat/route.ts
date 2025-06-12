'use server'

import { NextRequest, NextResponse } from 'next/server';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { SuperglueMCPClient } from '../../../../lib/llms';

// Helper function to extract and validate authentication token
function extractAndValidateToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return null;

    const expectedApiKey = process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY || process.env.AUTH_TOKEN;

    if (!expectedApiKey) {
        console.error('No API key configured in environment variables');
        return null;
    }

    if (token !== expectedApiKey) {
        console.error('Invalid API key provided');
        return null;
    }

    return token;
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate the request
        const apiKey = extractAndValidateToken(request)
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Unauthorized: Invalid or missing API key' },
                { status: 401 }
            )
        }

        const { messages, stream = true } = await request.json() as {
            messages: ChatCompletionMessageParam[],
            stream?: boolean
        }

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: 'Invalid messages format' },
                { status: 400 }
            )
        }

        const client = new SuperglueMCPClient(apiKey)

        // Handle streaming
        if (stream) {
            const encoder = new TextEncoder()
            const readable = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of client.streamLLMResponse(messages)) {
                            const data = `data: ${JSON.stringify(chunk)}\n\n`
                            controller.enqueue(encoder.encode(data))
                        }
                        controller.close()
                    } catch (error) {
                        console.error('Streaming error:', error)
                        const errorData = `data: ${JSON.stringify({
                            type: 'error',
                            content: error instanceof Error ? error.message : 'Unknown error'
                        })}\n\n`
                        controller.enqueue(encoder.encode(errorData))
                        controller.close()
                    }
                }
            })

            return new Response(readable, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
            })
        }

        // Fallback to non-streaming
        const response = await client.getLLMResponse(messages)
        return NextResponse.json({
            content: response,
            timestamp: new Date().toISOString()
        })

    } catch (error) {
        console.error('Chat API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
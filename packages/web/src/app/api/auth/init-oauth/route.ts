import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { apiKey } = await request.json();

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Missing API key' },
                { status: 400 }
            );
        }

        const response = NextResponse.json({ success: true });

        // Set httpOnly cookie with JWT
        response.cookies.set('api_key', apiKey, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 300, // 5 minutes
            path: '/api/auth/callback'
        });

        return response;
    } catch (error) {
        console.error('Init OAuth error:', error);
        return NextResponse.json(
            { error: 'Failed to initialize OAuth' },
            { status: 500 }
        );
    }
}


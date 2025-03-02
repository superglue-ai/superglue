import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return NextResponse.next()
  }

  if (
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/welcome') ||
    request.nextUrl.pathname.includes('.') // Skip static files
  ) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/welcome', request.url))
}

// Applies to all routes except these listed:
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
} 

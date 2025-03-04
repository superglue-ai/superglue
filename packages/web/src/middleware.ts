'use server'

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // Always skip middleware for these paths
  if (
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/welcome') ||
    request.nextUrl.pathname.includes('.') // Skip static files
  ) {
    return NextResponse.next();
  }

  // Check for email or emailEntrySkipped cookies
  const tenantEmail = request.cookies.get('sg_tenant_email')?.value;
  const emailEntrySkipped = request.cookies.get('sg_tenant_emailEntrySkipped')?.value;
  
  // If we have cookies, decide based on them
  if (tenantEmail || emailEntrySkipped === 'true') {
    return NextResponse.next();
  } else if (emailEntrySkipped === 'false') {
    return NextResponse.redirect(new URL('/welcome', request.url));
  }
  
  const GQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT
  const GQL_API_KEY = process.env.AUTH_TOKEN
  try {
    console.log('fetching gql');
    // TODO: remove once client SDK is updated
    const response = await fetch(`${GQL_ENDPOINT}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GQL_API_KEY}`,
      },
      body: JSON.stringify({
        query: `
          query GetTenantInfo {
            getTenantInfo {
              email
              emailEntrySkipped
            }
          }
        `,
      }),
    });

    if (response.ok) {
      const { data } = await response.json();
      const redirectResponse = NextResponse.redirect(new URL('/welcome', request.url));
      const nextResponse = NextResponse.next();
      if (data?.getTenantInfo?.email !== undefined) {
        const cookieValue = data.getTenantInfo.email || '';
        redirectResponse.cookies.set('sg_tenant_email', cookieValue, {
          path: '/',
          maxAge: 31536000,
          sameSite: 'strict'
        });
        nextResponse.cookies.set('sg_tenant_email', cookieValue, {
          path: '/',
          maxAge: 31536000,
          sameSite: 'strict'
        });
      }
      
      if (data?.getTenantInfo?.emailEntrySkipped !== undefined) {
        const skipValue = String(data.getTenantInfo.emailEntrySkipped);
        redirectResponse.cookies.set('sg_tenant_emailEntrySkipped', skipValue, {
          path: '/',
          maxAge: 31536000,
          sameSite: 'strict'
        });
        nextResponse.cookies.set('sg_tenant_emailEntrySkipped', skipValue, {
          path: '/',
          maxAge: 31536000,
          sameSite: 'strict'
        });
      }
      
      if (data?.getTenantInfo?.email || data?.getTenantInfo?.emailEntrySkipped === true) {
        return nextResponse;
      } else {
        // Either emailEntrySkipped is false or both values are null
        return redirectResponse;
      }
    }
  } catch (err) {
    // do nothing, will fall through to default redirect
  }
  
  return NextResponse.redirect(new URL('/welcome', request.url));
}

// Applies to all routes except these listed:
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
} 

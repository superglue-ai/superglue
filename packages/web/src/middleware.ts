import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { useConfig } from './app/config-context'

export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
    return NextResponse.next()
  }
  const hasAskedForEmail = request.cookies.get('sg_tenant_hasAskedForEmail')?.value === 'true'
  const tenantEmail = request.cookies.get('sg_tenant_email')?.value
  
  if (hasAskedForEmail || tenantEmail) {
    return NextResponse.next()
  } else {
    try {
      // TODO: remove once client SDK is updated
      const config = useConfig()
      const response = await fetch(`${config.superglueEndpoint}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            query GetTenantInfo {
              getTenantInfo {
                email
                hasAskedForEmail
              }
            }
          `,
        }),
      })

      if (response.ok) {
        const { data } = await response.json()
        if (data?.getTenantInfo?.hasAskedForEmail) {
          document.cookie = `sg_tenant_email=${data.getTenantInfo?.email}; path=/; max-age=31536000; SameSite=Strict`
          document.cookie = `sg_tenant_hasAskedForEmail=true; path=/; max-age=31536000; SameSite=Strict`
          return NextResponse.next()
        }
      }
    } catch (err) {
      // do nothing..
    }
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

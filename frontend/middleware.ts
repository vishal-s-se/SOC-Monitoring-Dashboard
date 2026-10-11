import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function isTokenExpired(token?: string): boolean {
  if (!token) return true
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('utf-8')
    const payload = JSON.parse(jsonPayload)
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000 <= Date.now()
    }
    return false
  } catch {
    return true
  }
}

export function middleware(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname === '/login'
  const sessionToken = request.cookies.get('soc_session')?.value
  const hasExpiredParam = request.nextUrl.searchParams.has('expired')
  const hasLogoutParam = request.nextUrl.searchParams.has('logout')
  const isExpired = !sessionToken || isTokenExpired(sessionToken)

  // If unauthenticated or token expired
  if (isExpired) {
    if (!isLoginPage) {
      const response = NextResponse.redirect(new URL('/login', request.url))
      if (sessionToken) {
        response.cookies.delete('soc_session')
      }
      return response
    }

    // On login page with expired/invalid cookie
    if (sessionToken) {
      const response = NextResponse.next()
      response.cookies.delete('soc_session')
      return response
    }
    return NextResponse.next()
  }

  // If authenticated and on login page
  if (isLoginPage) {
    if (hasExpiredParam || hasLogoutParam) {
      const response = NextResponse.next()
      response.cookies.delete('soc_session')
      return response
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}

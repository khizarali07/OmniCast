import { NextResponse, type NextRequest } from 'next/server'
import { decrypt } from '@/utils/session'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const session = request.cookies.get('custom_session')?.value
  let user = null

  if (session) {
    try {
      user = await decrypt(session)
    } catch (e) {
      // Invalid session
    }
  }

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                    request.nextUrl.pathname.startsWith('/signup') ||
                    request.nextUrl.pathname.startsWith('/forgot-password') ||
                    request.nextUrl.pathname.startsWith('/reset-password')

  const isVerifyPage = request.nextUrl.pathname.startsWith('/verify-email')
  const isLandingPage = request.nextUrl.pathname === '/'
  
  // If user is not logged in and trying to access protected route (anything not auth or landing)
  if (!user && !isAuthPage && !isVerifyPage && !isLandingPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If user is logged in but not verified, they must go to verify-email
  if (user && !user.is_verified && !isVerifyPage && !isAuthPage && !isLandingPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/verify-email'
    return NextResponse.redirect(url)
  }

  // If user is logged in and trying to access auth pages
  if (user && isAuthPage) {
    // If they are verified, always send to dashboard
    if (user.is_verified) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
    // If they are not verified, let them access auth pages (like login) so they can "sign out" or switch
    return response
  }
  return response
}

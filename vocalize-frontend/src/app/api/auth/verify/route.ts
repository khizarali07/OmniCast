import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const otp = searchParams.get('otp') || searchParams.get('token');
  const email = searchParams.get('email');

  if (!otp || !email) {
    return NextResponse.redirect(new URL('/login?error=Invalid verification link', request.url));
  }

  // Redirect to the UI page which will autofill the OTP
  return NextResponse.redirect(new URL(`/verify-email?otp=${otp}&email=${email}`, request.url));
}

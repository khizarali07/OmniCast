/**
 * GET /api/auth/token
 * -------------------
 * Decrypts the custom_session cookie and returns the raw JWT payload
 * so the frontend api.ts wrapper can attach it to backend requests.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const token = cookies().get("custom_session")?.value;
  
  if (!token) {
    return NextResponse.json({ token: null }, { status: 401 });
  }

  return NextResponse.json({ token });
}

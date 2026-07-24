import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Redirect using new URL to target route or dashboard
      return NextResponse.redirect(new URL(next, request.url));
    }
    console.error("Auth callback code exchange error:", error.message);
  }

  // Fallback: Check if active session already exists
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return NextResponse.redirect(new URL(next, request.url));
  }

  // Redirect to login page if session exchange or authentication failed
  return NextResponse.redirect(new URL("/login?error=Could%20not%20authenticate%20user", request.url));
}

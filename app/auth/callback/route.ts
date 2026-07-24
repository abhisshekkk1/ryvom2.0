import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Successfully exchanged OAuth code for active session
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("Auth callback code exchange error:", error.message);
  }

  // Fallback: Check if active session already exists
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Redirect to login page if session exchange or authentication failed
  return NextResponse.redirect(`${origin}/login?error=Could%20not%20authenticate%20user`);
}

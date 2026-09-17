import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const response = NextResponse.redirect(new URL(safeNext, origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Supabase OAuth callback error:", error.message);
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin));
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=Could%20not%20authenticate%20user", origin));
  }

  // Authentication is handled entirely by Supabase Auth.
  // Do not query the legacy public.users table here.
  return response;
}

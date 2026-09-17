import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const COACH_EMAIL = "abhishek0442@gmail.com";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. FAST-PATH: bypass public paths before any async operations
  const isPublicPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/client/") ||
    pathname.startsWith("/api/client-portal/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    /\.(png|jpg|jpeg|svg|webp|gif|css|js|ico|woff2?)$/.test(pathname);

  if (isPublicPath) {
    return NextResponse.next();
  }

  // 2. CHECK COOKIES before making network calls
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith("sb-") || c.name === "ryvom_user"
  );

  if (!hasAuthCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 3. INITIALIZE SUPABASE and verify session
  const supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 4. FETCH USER with timeout protection
  try {
    const getUserPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase auth timeout")), 3000)
    );

    const {
      data: { user },
    } = await Promise.race([getUserPromise, timeoutPromise]);

    if (!user || user.email?.toLowerCase() !== COACH_EMAIL.toLowerCase()) {
      // No session or unauthorized coach — sign out and redirect
      await supabase.auth.signOut().catch(() => {});
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Unauthorized coach access" },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("Only authorized coach account allowed."), request.url));
    }
  } catch {
    console.warn("Auth check timed out or failed in middleware");
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication timeout" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico)$).*)",
  ],
};

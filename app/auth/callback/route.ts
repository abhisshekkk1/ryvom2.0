import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getOrCreatePublicUser } from "@/lib/userHelper";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";

    const response = NextResponse.redirect(new URL(next, request.url));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    let authUser = null;

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data: { user } } = await supabase.auth.getUser();
        authUser = user;
      } else {
        console.error("Auth callback code exchange error:", error.message);
      }
    }

    if (!authUser) {
      const { data: { user } } = await supabase.auth.getUser();
      authUser = user;
    }

    if (authUser) {
      const publicUser = await getOrCreatePublicUser(authUser);
      const userObj = {
        id: publicUser?.id || authUser.id,
        email: authUser.email,
        username: publicUser?.username || authUser.email?.split("@")[0] || "User",
        role: publicUser?.role || "client",
      };
      response.cookies.set("ryvom_user", JSON.stringify(userObj), { path: "/", maxAge: 31536000, sameSite: "lax" });
      return response;
    }

    return NextResponse.redirect(new URL("/login?error=Could%20not%20authenticate%20user", request.url));
  } catch (err: unknown) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(new URL("/login?error=Authentication%20failed", request.url));
  }
}

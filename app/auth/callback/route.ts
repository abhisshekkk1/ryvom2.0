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

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          await getOrCreatePublicUser(user);
          response.cookies.set("ryvom_user", "true", { path: "/", maxAge: 31536000, sameSite: "lax" });
        }
        return response;
      }
      console.error("Auth callback code exchange error:", error.message);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await getOrCreatePublicUser(user);
      response.cookies.set("ryvom_user", "true", { path: "/", maxAge: 31536000, sameSite: "lax" });
      return response;
    }

    return NextResponse.redirect(new URL("/login?error=Could%20not%20authenticate%20user", request.url));
  } catch (err: unknown) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(new URL("/login?error=Authentication%20failed", request.url));
  }
}

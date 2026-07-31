import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getOrCreatePublicUser } from "@/lib/userHelper";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          await getOrCreatePublicUser(session.user);
        }
        return NextResponse.redirect(new URL(next, request.url));
      }
      console.error("Auth callback code exchange error:", error.message);
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      await getOrCreatePublicUser(session.user);
      return NextResponse.redirect(new URL(next, request.url));
    }

    return NextResponse.redirect(new URL("/login?error=Could%20not%20authenticate%20user", request.url));
  } catch (err: unknown) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(new URL("/login?error=Authentication%20failed", request.url));
  }
}

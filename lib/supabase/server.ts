import { createServerClient } from "@supabase/ssr";
import { type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const COACH_EMAIL = "abhishek0442@gmail.com";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can fail when called from Server Components
          }
        },
      },
    }
  );
}

export async function getCoachAuth() {
  const supabase = await createServerSupabase();

  // 1. Fast local cryptographic verification via getClaims() with asymmetric key (ES256)
  try {
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (!claimsError && claimsData?.claims) {
      const claims = claimsData.claims as {
        sub?: string;
        email?: string;
        app_metadata?: Record<string, unknown>;
        user_metadata?: Record<string, unknown>;
        aud?: string;
        role?: string;
      };

      const email = claims.email;
      const id = claims.sub;

      if (!id || !email || email.toLowerCase() !== COACH_EMAIL.toLowerCase()) {
        return { supabase: null, user: null };
      }

      const user: User = {
        id,
        email,
        app_metadata: claims.app_metadata || {},
        user_metadata: claims.user_metadata || {},
        aud: claims.aud || "authenticated",
        role: claims.role || "authenticated",
        created_at: "",
      };

      return { supabase, user };
    }
  } catch {
    // If getClaims fails or is unavailable, gracefully fall back to getUser()
  }

  // 2. Authoritative network fallback via GoTrue getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email?.toLowerCase() !== COACH_EMAIL.toLowerCase()) {
    return { supabase: null, user: null };
  }

  return { supabase, user };
}

export { COACH_EMAIL };

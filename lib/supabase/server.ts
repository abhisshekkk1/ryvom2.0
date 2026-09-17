import { createServerClient } from "@supabase/ssr";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email?.toLowerCase() !== COACH_EMAIL.toLowerCase()) {
    return { supabase: null, user: null };
  }

  return { supabase, user };
}

export { COACH_EMAIL };

import { getCoachAuth } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { PLATFORM_ADMIN_EMAIL, isPlatformAdmin } from "@/lib/adminConstants";

export { PLATFORM_ADMIN_EMAIL, isPlatformAdmin };

/**
 * Server-side guard for admin API routes.
 * Enforces authentication and platform-admin authorization.
 * Returns either { user, supabase } or a NextResponse error with 401/403 status.
 */
export async function requirePlatformAdmin() {
  const { user, supabase } = await getCoachAuth();

  if (!supabase || !user) {
    return {
      authorized: false as const,
      errorResponse: NextResponse.json(
        { error: "Unauthorized. Authentication required." },
        { status: 401 }
      ),
      user: null,
      supabase: null,
    };
  }

  if (!isPlatformAdmin(user.email)) {
    return {
      authorized: false as const,
      errorResponse: NextResponse.json(
        { error: "Forbidden. Platform administrator privileges required." },
        { status: 403 }
      ),
      user: null,
      supabase: null,
    };
  }

  return {
    authorized: true as const,
    errorResponse: null,
    user,
    supabase,
  };
}

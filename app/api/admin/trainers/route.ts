import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/adminAuth";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface AdminTrainerItem {
  id: string;
  name: string;
  email: string;
  status: "active" | "invited" | "pending";
  created_at: string;
  invited_at: string | null;
  last_sign_in_at: string | null;
}

// GET /api/admin/trainers — List all trainers for platform admin
export async function GET() {
  const authCheck = await requirePlatformAdmin();
  if (!authCheck.authorized) {
    return authCheck.errorResponse;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured on this server. Add it to .env.local to enable admin management.",
        trainers: [],
      },
      { status: 503 }
    );
  }

  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });

    if (error) {
      console.error("Failed to list users from auth.admin:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const trainers: AdminTrainerItem[] = (data?.users || []).map((u) => {
      const metaName = u.user_metadata?.full_name || u.user_metadata?.name;
      const email = u.email || "No email";
      const name =
        typeof metaName === "string" && metaName.trim()
          ? metaName.trim()
          : email.split("@")[0];

      let status: "active" | "invited" | "pending" = "pending";
      if (u.email_confirmed_at || u.last_sign_in_at) {
        status = "active";
      } else if (u.invited_at) {
        status = "invited";
      }

      return {
        id: u.id,
        name,
        email,
        status,
        created_at: u.created_at,
        invited_at: u.invited_at || null,
        last_sign_in_at: u.last_sign_in_at || null,
      };
    });

    return NextResponse.json({ trainers });
  } catch (err: unknown) {
    console.error("Admin trainers list error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

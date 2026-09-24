import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/adminAuth";
import { createAdminSupabase } from "@/lib/supabase/admin";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/admin/trainers/invite — Invite a new trainer (Platform Admin only)
export async function POST(request: Request) {
  // 1. Authoritative platform admin verification
  const authCheck = await requirePlatformAdmin();
  if (!authCheck.authorized) {
    return authCheck.errorResponse;
  }

  // 2. Verify server configuration
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is required to send trainer invitations. Please add it to your server configuration.",
      },
      { status: 503 }
    );
  }

  // 3. Parse and validate request body
  let body: { email?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "A valid trainer email address is required." },
      { status: 400 }
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "Trainer full name is required." },
      { status: 400 }
    );
  }

  // 4. Send official Supabase invitation
  try {
    const admin = createAdminSupabase();
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/confirm?redirect_to=/auth/accept-invite`;

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: name,
        role: "coach",
      },
      redirectTo,
    });

    if (error) {
      console.error("Supabase inviteUserByEmail error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to send invitation email." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        trainer: {
          id: data.user?.id,
          email: data.user?.email,
          name,
          status: "invited",
          created_at: data.user?.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("Trainer invite exception:", err);
    const msg = err instanceof Error ? err.message : "Failed to invite trainer.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

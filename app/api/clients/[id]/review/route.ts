import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/clients/[id]/review — save coach review for a check-in
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  if (!clientId || !UUID_REGEX.test(clientId)) {
    return NextResponse.json({ error: "Invalid client ID format" }, { status: 400 });
  }

  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify client belongs to this coach
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("coach_user_id", user.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await request.json();
  const { check_in_id, wins, issues, adjustments, next_week_goals, coach_notes, status } = body;

  if (!check_in_id || !UUID_REGEX.test(check_in_id))
    return NextResponse.json(
      { error: "Valid check_in_id is required" },
      { status: 400 }
    );

  // Verify the check-in belongs to this client
  const { data: checkin } = await supabase
    .from("check_ins")
    .select("id, client_id")
    .eq("id", check_in_id)
    .single();

  if (!checkin || checkin.client_id !== clientId)
    return NextResponse.json(
      { error: "Check-in not found" },
      { status: 404 }
    );

  // Upsert the review
  const { error: reviewError } = await supabase
    .from("coach_reviews")
    .upsert(
      {
        check_in_id,
        wins: wins || null,
        issues: issues || null,
        adjustments: adjustments || null,
        next_week_goals: next_week_goals || null,
        coach_notes: coach_notes || null,
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: "check_in_id" }
    );

  if (reviewError)
    return NextResponse.json({ error: reviewError.message }, { status: 500 });

  // Update check-in status
  const newStatus = status || "reviewed";
  const { error: statusError } = await supabase
    .from("check_ins")
    .update({ status: newStatus })
    .eq("id", check_in_id);

  if (statusError)
    return NextResponse.json({ error: statusError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

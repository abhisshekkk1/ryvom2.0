import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

// GET /api/self — fetch or auto-initialize coach's own profile
export async function GET() {
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look for existing self client record
  const { data: existing, error: fetchErr } = await supabase
    .from("clients")
    .select("*")
    .eq("coach_user_id", user.id)
    .eq("is_self", true)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ client: existing });
  }

  // Create coach's personal profile row in clients table
  const { data: newProfile, error: insertErr } = await supabase
    .from("clients")
    .insert({
      coach_user_id: user.id,
      full_name: "Coach (Personal Profile)",
      email: user.email,
      goal: "Personal Transformation & Performance Benchmarks",
      is_self: true,
      active: true,
    })
    .select("*")
    .single();

  if (insertErr) {
    // If unique constraint violation or concurrent insert occurred, attempt to fetch existing
    const { data: retryProfile } = await supabase
      .from("clients")
      .select("*")
      .eq("coach_user_id", user.id)
      .eq("is_self", true)
      .maybeSingle();

    if (retryProfile) {
      return NextResponse.json({ client: retryProfile });
    }

    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ client: newProfile }, { status: 201 });
}

// PUT /api/self — update self-profile details
export async function PUT(request: Request) {
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from("clients")
    .update({
      full_name: body.full_name?.trim() || "Coach",
      goal: body.goal?.trim() || null,
      starting_weight: body.starting_weight !== undefined ? body.starting_weight : null,
      target_weight: body.target_weight !== undefined ? body.target_weight : null,
      target_date: body.target_date || null,
      notes: body.notes?.trim() || null,
    })
    .eq("coach_user_id", user.id)
    .eq("is_self", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ client: data });
}

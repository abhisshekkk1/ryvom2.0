import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { attachSignedPhotoUrlsToCheckins } from "@/lib/photoStorage";

// GET /api/clients/[id] — get a single client with all check-ins and reviews
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .single();

  if (error || !client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: rawCheckins } = await supabase
    .from("check_ins")
    .select("*")
    .eq("client_id", id)
    .order("week_ending", { ascending: false });

  // Resolve private photo paths to temporary signed URLs
  const adminDb = createAdminSupabase();
  const checkins = await attachSignedPhotoUrlsToCheckins(
    adminDb,
    rawCheckins || [],
    id
  );

  const checkinIds = (checkins || []).map((c) => c.id);
  let reviews: Record<string, unknown>[] = [];
  if (checkinIds.length) {
    const { data: r } = await supabase
      .from("coach_reviews")
      .select("*")
      .in("check_in_id", checkinIds);
    reviews = r || [];
  }

  // Check for active access link
  const { data: access } = await supabase
    .from("client_access")
    .select("id, active, created_at, last_used_at")
    .eq("client_id", id)
    .eq("active", true)
    .limit(1);

  return NextResponse.json({
    client,
    checkins: checkins || [],
    reviews,
    hasActiveLink: (access?.length || 0) > 0,
  });
}

// PUT /api/clients/[id] — update client details
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const updateData: Record<string, unknown> = {};
  if (body.full_name !== undefined)
    updateData.full_name = body.full_name.trim();
  if (body.email !== undefined) updateData.email = body.email?.trim() || null;
  if (body.phone !== undefined) updateData.phone = body.phone?.trim() || null;
  if (body.goal !== undefined) updateData.goal = body.goal?.trim() || null;
  if (body.starting_weight !== undefined)
    updateData.starting_weight = body.starting_weight || null;
  if (body.target_weight !== undefined)
    updateData.target_weight = body.target_weight || null;
  if (body.target_date !== undefined)
    updateData.target_date = body.target_date || null;
  if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;
  if (body.active !== undefined) updateData.active = body.active;

  const { data, error } = await supabase
    .from("clients")
    .update(updateData)
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ client: data });
}

// DELETE /api/clients/[id] — permanently delete a client (prefer archive via PUT active=false)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check if client exists and is not self profile
  const { data: client } = await supabase
    .from("clients")
    .select("is_self")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .single();

  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (client.is_self)
    return NextResponse.json({ error: "Cannot delete coach personal profile" }, { status: 400 });

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("coach_user_id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

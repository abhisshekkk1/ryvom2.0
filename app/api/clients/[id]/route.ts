import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { attachSignedPhotoUrlsToCheckins } from "@/lib/photoStorage";
import type { CoachReview } from "@/lib/types";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/clients/[id] — get a single client with all check-ins and reviews
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params;
  const id = typeof rawParams?.id === "string" ? rawParams.id.trim() : "";

  if (!id || id === "undefined") {
    return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
  }

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid client ID format" }, { status: 400 });
  }

  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Database query error for client:", error);
    return NextResponse.json(
      { error: `Database error: ${error.message}` },
      { status: 500 }
    );
  }

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Security: strict ownership verification
  if (client.coach_user_id !== user.id) {
    return NextResponse.json(
      { error: "Access denied. This client does not belong to your coach account." },
      { status: 403 }
    );
  }

  const url = new URL(_request.url);
  const includePhotos = url.searchParams.get("photos") === "true";

  // Execute independent sub-queries in parallel
  const [checkinsRes, reviewsRes, accessRes, metricsRes, logsRes, notesRes] = await Promise.all([
    supabase
      .from("check_ins")
      .select("id, client_id, week_ending, submitted_at, weight, average_weight, waist_cm, diet_adherence, training_adherence, average_steps, sleep_hours, hunger, energy, stress, client_notes, photo_front_url, photo_side_url, photo_back_url, status, created_at, updated_at")
      .eq("client_id", id)
      .order("week_ending", { ascending: false }),
    supabase
      .from("coach_reviews")
      .select("id, check_in_id, coach_notes, wins, issues, adjustments, next_week_goals, reviewed_at, check_ins!inner(client_id)")
      .eq("check_ins.client_id", id),
    supabase
      .from("client_access")
      .select("id, active, created_at, last_used_at")
      .eq("client_id", id)
      .eq("active", true)
      .limit(1),
    supabase
      .from("performance_metrics")
      .select("id, client_id, name, unit, metric_type, target_value, track_on_checkin, show_on_dashboard, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("performance_logs")
      .select("id, metric_id, client_id, check_in_id, logged_date, value, notes, created_at")
      .eq("client_id", id)
      .order("logged_date", { ascending: true }),
    supabase
      .from("client_coach_notes")
      .select("id, client_id, note_date, note, category, created_at")
      .eq("client_id", id)
      .order("note_date", { ascending: false }),
  ]);

  if (checkinsRes.error) {
    console.error("Error fetching checkins:", checkinsRes.error);
  }
  if (reviewsRes.error) {
    console.error("Error fetching reviews:", reviewsRes.error);
  }

  let checkins = checkinsRes.data || [];

  // Strip the joined check_ins relationship to preserve exact CoachReview shape
  const reviews: CoachReview[] = (reviewsRes.data || []).map((r) => {
    const review = { ...(r as Record<string, unknown>) };
    delete review.check_ins;
    return review as unknown as CoachReview;
  });

  // Only perform photo signing round-trips when explicitly requested (e.g. photos tab)
  if (includePhotos && checkins.length > 0) {
    let storageClient = supabase;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        storageClient = createAdminSupabase();
      } catch {
        // Fallback to authenticated coach client
      }
    }

    try {
      checkins = await attachSignedPhotoUrlsToCheckins(
        storageClient,
        checkins,
        id
      );
    } catch (photoErr) {
      console.warn("Storage sign URL fallback:", photoErr);
    }
  }

  // Combine metrics with their logs
  const metricsWithLogs = (metricsRes.data || []).map((m) => ({
    ...m,
    logs: (logsRes.data || []).filter((l) => l.metric_id === m.id),
  }));

  return NextResponse.json({
    client,
    checkins,
    reviews,
    hasActiveLink: (accessRes.data?.length || 0) > 0,
    metrics: metricsWithLogs,
    coachNotes: notesRes.data || [],
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

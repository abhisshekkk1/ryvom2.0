import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  extractPhotoPath,
  validatePhotoOwnership,
  attachSignedPhotoUrlsToCheckins,
} from "@/lib/photoStorage";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/clients/[id]/checkins — fetch all check-ins for a client
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid client ID format" }, { status: 400 });
  }

  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify client belongs to coach
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: rawCheckins, error } = await supabase
    .from("check_ins")
    .select("id, client_id, week_ending, submitted_at, weight, average_weight, waist_cm, diet_adherence, training_adherence, average_steps, sleep_hours, hunger, energy, stress, client_notes, photo_front_url, photo_side_url, photo_back_url, status, created_at, updated_at")
    .eq("client_id", id)
    .order("week_ending", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let storageClient = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      storageClient = createAdminSupabase();
    } catch {
      // Fall back to coach authenticated supabase client
    }
  }

  let checkins = rawCheckins || [];
  try {
    checkins = await attachSignedPhotoUrlsToCheckins(
      storageClient,
      rawCheckins || [],
      id
    );
  } catch (photoErr) {
    console.warn("Checkins photo signing fallback:", photoErr);
  }

  return NextResponse.json({ checkins: checkins || [] });
}

// POST /api/clients/[id]/checkins — coach logs a check-in for a client
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid client ID format" }, { status: 400 });
  }

  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify client belongs to coach
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await request.json();

  if (!body.week_ending) {
    return NextResponse.json({ error: "week_ending date is required" }, { status: 400 });
  }

  // Extract and validate photo storage paths
  const frontPath = extractPhotoPath(body.photo_front_url);
  const sidePath = extractPhotoPath(body.photo_side_url);
  const backPath = extractPhotoPath(body.photo_back_url);

  if (
    !validatePhotoOwnership(frontPath, id) ||
    !validatePhotoOwnership(sidePath, id) ||
    !validatePhotoOwnership(backPath, id)
  ) {
    return NextResponse.json(
      { error: "Unauthorized photo path detected." },
      { status: 403 }
    );
  }

  const payload = {
    client_id: id,
    week_ending: body.week_ending,
    weight: body.weight ?? null,
    average_weight: body.average_weight ?? null,
    waist_cm: body.waist_cm ?? null,
    diet_adherence: body.diet_adherence ?? null,
    training_adherence: body.training_adherence ?? null,
    average_steps: body.average_steps ?? null,
    sleep_hours: body.sleep_hours ?? null,
    hunger: body.hunger ?? null,
    energy: body.energy ?? null,
    stress: body.stress ?? null,
    client_notes: body.client_notes?.trim() || null,
    photo_front_url: frontPath,
    photo_side_url: sidePath,
    photo_back_url: backPath,
    status: body.status || "reviewed", // if coach logs it directly, defaults to reviewed
  };

  const { data, error } = await supabase
    .from("check_ins")
    .upsert(payload, { onConflict: "client_id,week_ending" })
    .select("id, client_id, week_ending, submitted_at, weight, average_weight, waist_cm, diet_adherence, training_adherence, average_steps, sleep_hours, hunger, energy, stress, client_notes, photo_front_url, photo_side_url, photo_back_url, status, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ checkin: data }, { status: 201 });
}

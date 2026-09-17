import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolve(token: string) {
  const db = admin();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: access } = await db.from("client_access").select("client_id,active,expires_at").eq("token_hash", hash).single();
  if (!access?.active || (access.expires_at && new Date(access.expires_at) < new Date())) return null;
  await db.from("client_access").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash);
  return { db, clientId: access.client_id as string };
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const result = await resolve(token);
    if (!result) return NextResponse.json({ error: "This client link is invalid or expired." }, { status: 404 });
    const { db, clientId } = result;
    const { data: client } = await db.from("clients").select("id,full_name,email,goal,starting_weight,target_weight,target_date,notes").eq("id", clientId).single();
    const { data: checkins } = await db.from("check_ins").select("id,week_ending,submitted_at,weight,average_weight,waist_cm,diet_adherence,training_adherence,average_steps,sleep_hours,hunger,energy,stress,client_notes,status,photo_front_url,photo_side_url,photo_back_url").eq("client_id", clientId).order("week_ending", { ascending: false });
    const ids = (checkins || []).map(x => x.id);
    const { data: reviews } = ids.length ? await db.from("coach_reviews").select("check_in_id,wins,issues,adjustments,next_week_goals,reviewed_at").in("check_in_id", ids) : { data: [] };
    return NextResponse.json({ client, checkins: checkins || [], reviews: reviews || [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Portal is not configured. Add SUPABASE_SERVICE_ROLE_KEY to the deployment environment." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const result = await resolve(token);
    if (!result) return NextResponse.json({ error: "This client link is invalid or expired." }, { status: 404 });
    const body = await request.json();
    const { db, clientId } = result;
    if (!body.week_ending) return NextResponse.json({ error: "Week ending date is required." }, { status: 400 });
    const payload = {
      client_id: clientId, week_ending: body.week_ending, weight: body.weight ?? null, average_weight: body.average_weight ?? null,
      waist_cm: body.waist_cm ?? null, diet_adherence: body.diet_adherence ?? null, training_adherence: body.training_adherence ?? null,
      average_steps: body.average_steps ?? null, sleep_hours: body.sleep_hours ?? null, hunger: body.hunger ?? null,
      energy: body.energy ?? null, stress: body.stress ?? null, client_notes: body.client_notes ?? null,
      photo_front_url: body.photo_front_url ?? null, photo_side_url: body.photo_side_url ?? null, photo_back_url: body.photo_back_url ?? null,
      status: "pending"
    };
    const { data, error } = await db.from("check_ins").upsert(payload, { onConflict: "client_id,week_ending" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not save check-in." }, { status: 500 });
  }
}

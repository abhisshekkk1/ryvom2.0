import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

// GET /api/clients — list all clients with their latest check-in
export async function GET(request: Request) {
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const showArchived = url.searchParams.get("archived") === "true";

  const { data: clients, error } = await supabase
    .from("clients")
    .select("*")
    .eq("coach_user_id", user.id)
    .eq("active", !showArchived)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!clients?.length) {
    return NextResponse.json({ clients: [], checkins: [] });
  }

  const clientIds = clients.map((c: { id: string }) => c.id);
  const { data: checkins } = await supabase
    .from("check_ins")
    .select("*")
    .in("client_id", clientIds)
    .order("week_ending", { ascending: false });

  return NextResponse.json({
    clients: clients || [],
    checkins: checkins || [],
  });
}

// POST /api/clients — create a new client
export async function POST(request: Request) {
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!body.full_name?.trim()) {
    return NextResponse.json(
      { error: "Full name is required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      coach_user_id: user.id,
      full_name: body.full_name.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      goal: body.goal?.trim() || null,
      starting_weight: body.starting_weight || null,
      target_weight: body.target_weight || null,
      target_date: body.target_date || null,
      notes: body.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ client: data }, { status: 201 });
}

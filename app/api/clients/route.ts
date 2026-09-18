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
    .select("id, full_name, email, phone, goal, starting_weight, target_weight, target_date, active, created_at")
    .eq("coach_user_id", user.id)
    .eq("active", !showArchived)
    .eq("is_self", false)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!clients?.length) {
    return NextResponse.json({ clients: [], checkins: [], totalCheckins: 0 });
  }

  const clientIds = clients.map((c: { id: string }) => c.id);

  // 1. Get total historical check-in count without downloading rows (exact HEAD query)
  const countPromise = supabase
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .in("client_id", clientIds);

  // 2. Fetch only the latest 2 check-ins per client (efficient RPC or optimized fallback query)
  const rpcPromise = supabase.rpc("get_dashboard_checkins");

  const [countRes, rpcRes] = await Promise.all([countPromise, rpcPromise]);

  let checkins: Array<Record<string, unknown>> = [];

  if (!rpcRes.error && Array.isArray(rpcRes.data)) {
    checkins = rpcRes.data;
  } else {
    // Graceful fallback if RPC function is not installed: fetch only essential columns
    const { data: rawCheckins } = await supabase
      .from("check_ins")
      .select("id, client_id, week_ending, weight, waist_cm, diet_adherence, training_adherence, sleep_hours, stress, status")
      .in("client_id", clientIds)
      .order("week_ending", { ascending: false });

    // Restrict in memory to at most 2 latest check-ins per client
    const perClientCount = new Map<string, number>();
    checkins = (rawCheckins || []).filter((ci) => {
      const count = perClientCount.get(ci.client_id) || 0;
      if (count < 2) {
        perClientCount.set(ci.client_id, count + 1);
        return true;
      }
      return false;
    });
  }

  return NextResponse.json({
    clients: clients || [],
    checkins,
    totalCheckins: countRes.count ?? checkins.length,
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

import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

// POST /api/clients/[id]/performance/log — record a performance entry
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  if (!body.metric_id || body.value === undefined || body.value === null) {
    return NextResponse.json(
      { error: "metric_id and numeric value are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("performance_logs")
    .insert({
      client_id: id,
      metric_id: body.metric_id,
      check_in_id: body.check_in_id || null,
      logged_date: body.logged_date || new Date().toISOString().split("T")[0],
      value: parseFloat(body.value),
      notes: body.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ log: data }, { status: 201 });
}

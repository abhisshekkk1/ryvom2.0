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

  const numericVal = parseFloat(body.value);
  if (isNaN(numericVal) || !isFinite(numericVal)) {
    return NextResponse.json(
      { error: "Value must be a valid finite number" },
      { status: 400 }
    );
  }

  // Verify metric belongs to this client (prevents cross-client metric logging)
  const { data: metric } = await supabase
    .from("performance_metrics")
    .select("id")
    .eq("id", body.metric_id)
    .eq("client_id", id)
    .single();

  if (!metric) {
    return NextResponse.json(
      { error: "Metric does not belong to this client" },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("performance_logs")
    .insert({
      client_id: id,
      metric_id: body.metric_id,
      check_in_id: body.check_in_id || null,
      logged_date: body.logged_date || new Date().toISOString().split("T")[0],
      value: numericVal,
      notes: body.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ log: data }, { status: 201 });
}

// DELETE /api/clients/[id]/performance/log — delete a specific performance log entry
export async function DELETE(
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

  const url = new URL(request.url);
  const logId = url.searchParams.get("logId");

  if (!logId) {
    return NextResponse.json({ error: "logId is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("performance_logs")
    .delete()
    .eq("id", logId)
    .eq("client_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

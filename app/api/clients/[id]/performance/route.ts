import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/clients/[id]/performance — list metrics and logs for a client
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

  // Verify client belongs to coach and is active
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Fetch metrics
  const { data: metrics, error: metricsErr } = await supabase
    .from("performance_metrics")
    .select("id, client_id, name, unit, metric_type, target_value, track_on_checkin, show_on_dashboard, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: true });

  if (metricsErr) {
    return NextResponse.json({ error: metricsErr.message }, { status: 500 });
  }

  if (!metrics || metrics.length === 0) {
    return NextResponse.json({ metrics: [] });
  }

  // Fetch logs for all metrics of this client
  const { data: logs, error: logsErr } = await supabase
    .from("performance_logs")
    .select("id, metric_id, client_id, check_in_id, logged_date, value, notes, created_at")
    .eq("client_id", id)
    .order("logged_date", { ascending: true });

  if (logsErr) {
    return NextResponse.json({ error: logsErr.message }, { status: 500 });
  }

  // Combine metrics with their logs
  const metricsWithLogs = metrics.map((m) => ({
    ...m,
    logs: (logs || []).filter((l) => l.metric_id === m.id),
  }));

  return NextResponse.json({ metrics: metricsWithLogs });
}

// POST /api/clients/[id]/performance — create a new metric
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

  // Verify client belongs to coach and is active
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Metric name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("performance_metrics")
    .insert({
      client_id: id,
      name: body.name.trim(),
      unit: body.unit?.trim() || "kg",
      metric_type: body.metric_type || "weight",
      target_value: body.target_value ?? null,
      track_on_checkin: Boolean(body.track_on_checkin),
      show_on_dashboard: body.show_on_dashboard !== false,
    })
    .select("id, client_id, name, unit, metric_type, target_value, track_on_checkin, show_on_dashboard, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ metric: { ...data, logs: [] } }, { status: 201 });
}

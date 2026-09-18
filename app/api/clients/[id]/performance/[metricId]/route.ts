import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/clients/[id]/performance/[metricId] — delete a metric
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  const { id, metricId } = await params;
  if (!id || !metricId || !UUID_REGEX.test(id) || !UUID_REGEX.test(metricId)) {
    return NextResponse.json({ error: "Invalid client or metric ID format." }, { status: 400 });
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

  const { error } = await supabase
    .from("performance_metrics")
    .delete()
    .eq("id", metricId)
    .eq("client_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

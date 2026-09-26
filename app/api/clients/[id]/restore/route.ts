import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/clients/[id]/restore — restore a soft-deleted client
export async function POST(
  _request: Request,
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

  // 1. Verify client exists and belongs strictly to the authenticated coach
  const { data: client, error: fetchError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // 2. Client must currently have deleted_at populated
  if (!client.deleted_at) {
    return NextResponse.json(
      { error: "Client is not in trash (already active)", client },
      { status: 400 }
    );
  }

  // 3. Restore client: clear deleted_at timestamp
  const { data: restored, error: updateError } = await supabase
    .from("clients")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("coach_user_id", user.id)
    .not("deleted_at", "is", null)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Client restored successfully",
    client: restored,
  });
}

import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/clients/[id]/coach-notes/[noteId]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  if (!id || !noteId || !UUID_REGEX.test(id) || !UUID_REGEX.test(noteId)) {
    return NextResponse.json({ error: "Invalid client or note ID format." }, { status: 400 });
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
    .from("client_coach_notes")
    .delete()
    .eq("id", noteId)
    .eq("client_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

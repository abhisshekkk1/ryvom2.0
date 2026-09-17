import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

// DELETE /api/clients/[id]/coach-notes/[noteId]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
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
    .from("coach_notes")
    .delete()
    .eq("id", noteId)
    .eq("client_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

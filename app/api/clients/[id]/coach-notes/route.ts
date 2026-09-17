import { NextResponse } from "next/server";
import { getCoachAuth } from "@/lib/supabase/server";

// GET /api/clients/[id]/coach-notes — list private coach notes
export async function GET(
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

  const { data: notes, error } = await supabase
    .from("client_coach_notes")
    .select("*")
    .eq("client_id", id)
    .order("note_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: notes || [] });
}

// POST /api/clients/[id]/coach-notes — create a private coach note
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

  if (!body.note?.trim()) {
    return NextResponse.json({ error: "Note content is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_coach_notes")
    .insert({
      client_id: id,
      note_date: body.note_date || new Date().toISOString().split("T")[0],
      note: body.note.trim(),
      category: body.category || "general",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note: data }, { status: 201 });
}

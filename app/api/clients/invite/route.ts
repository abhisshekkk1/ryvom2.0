import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getCoachAuth } from "@/lib/supabase/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const { supabase, user } = await getCoachAuth();
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!body.client_id || !UUID_REGEX.test(body.client_id)) {
    return NextResponse.json({ error: "A valid client_id UUID is required" }, { status: 400 });
  }
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", body.client_id)
    .eq("coach_user_id", user.id)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await supabase.from("client_access").update({ active: false }).eq("client_id", client.id);
  const { error } = await supabase.from("client_access").insert({ client_id: client.id, token_hash: tokenHash });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: `${new URL(request.url).origin}/client/${token}` });
}

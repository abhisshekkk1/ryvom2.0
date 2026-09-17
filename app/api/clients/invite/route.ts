import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const COACH_EMAIL = "abhishek0442@gmail.com";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!body.client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  const { data: client } = await supabase.from("clients").select("id").eq("id", body.client_id).eq("coach_user_id", user.id).single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await supabase.from("client_access").update({ active: false }).eq("client_id", client.id);
  const { error } = await supabase.from("client_access").insert({ client_id: client.id, token_hash: tokenHash });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: `${new URL(request.url).origin}/client/${token}` });
}

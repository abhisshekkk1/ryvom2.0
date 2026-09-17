import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function resolve(token: string) {
  const db = admin();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: access } = await db
    .from("client_access")
    .select("client_id,active,expires_at")
    .eq("token_hash", hash)
    .single();

  if (!access?.active || (access.expires_at && new Date(access.expires_at) < new Date())) {
    return null;
  }
  return { db, clientId: access.client_id as string };
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/jpg",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const resolved = await resolve(token);
    if (!resolved) {
      return NextResponse.json(
        { error: "This client link is invalid or expired." },
        { status: 404 }
      );
    }

    const { db, clientId } = resolved;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const angle = (formData.get("angle") as string) || "photo";

    if (!file) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WEBP, and HEIC images are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit." },
        { status: 400 }
      );
    }

    // Ensure client-photos bucket exists
    const { data: buckets } = await db.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.id === "client-photos");
    if (!bucketExists) {
      await db.storage.createBucket("client-photos", {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `${Date.now()}_${angle}_${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = `clients/${clientId}/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await db.storage
      .from("client-photos")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = db.storage
      .from("client-photos")
      .getPublicUrl(filePath);

    return NextResponse.json({
      ok: true,
      url: publicUrlData.publicUrl,
      path: filePath,
    });
  } catch (e: unknown) {
    console.error("Portal photo upload error:", e);
    const msg = e instanceof Error ? e.message : "Photo upload failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

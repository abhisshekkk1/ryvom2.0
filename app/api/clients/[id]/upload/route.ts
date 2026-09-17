import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCoachAuth } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getCoachAuth();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // Verify coach owns this client
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", id)
      .eq("coach_user_id", user.id)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client not found or access denied." },
        { status: 404 }
      );
    }

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

    const adminDb = createAdminSupabase();

    // Ensure private bucket exists
    const { data: buckets } = await adminDb.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.id === "client-photos");
    if (!bucketExists) {
      await adminDb.storage.createBucket("client-photos", {
        public: false, // Strictly private bucket
        fileSizeLimit: MAX_FILE_SIZE,
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `${Date.now()}_${angle}_${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = `clients/${id}/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminDb.storage
      .from("client-photos")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Coach upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Generate a temporary signed URL for immediate secure preview (valid 2 hours)
    const { data: signedData, error: signErr } = await adminDb.storage
      .from("client-photos")
      .createSignedUrl(filePath, 7200);

    if (signErr) {
      console.error("Sign URL error:", signErr);
    }

    return NextResponse.json({
      ok: true,
      url: signedData?.signedUrl || filePath,
      path: filePath,
    });
  } catch (e: unknown) {
    console.error("Coach photo upload error:", e);
    const msg = e instanceof Error ? e.message : "Photo upload failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

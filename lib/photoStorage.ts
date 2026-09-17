import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Extracts the storage path (e.g., 'clients/{clientId}/{filename}') from a photo URL or path.
 */
export function extractPhotoPath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;

  // If it's already a relative path starting with clients/
  if (trimmed.startsWith("clients/")) {
    return trimmed.split("?")[0];
  }

  // If it contains /client-photos/
  if (trimmed.includes("/client-photos/")) {
    const parts = trimmed.split("/client-photos/");
    if (parts[1]) {
      return parts[1].split("?")[0];
    }
  }

  return trimmed;
}

/**
 * Validates that a storage path belongs strictly to the given clientId.
 * Prevents cross-client photo access and tampering.
 */
export function validatePhotoOwnership(path: string | null | undefined, clientId: string): boolean {
  if (!path) return true; // empty is valid (no photo)
  const normalized = extractPhotoPath(path);
  if (!normalized) return true;
  return normalized.startsWith(`clients/${clientId}/`);
}

/**
 * Generates a temporary signed URL for a photo if it belongs to the specified client.
 * Returns null if the photo belongs to a different client (rejects cross-client leakage).
 */
export async function signPhotoUrl(
  supabase: SupabaseClient,
  pathOrUrl: string | null | undefined,
  clientId: string,
  expiresInSeconds = 7200 // 2 hours
): Promise<string | null> {
  if (!pathOrUrl) return null;
  const path = extractPhotoPath(pathOrUrl);
  if (!path) return null;

  // Strict ownership check
  if (!validatePhotoOwnership(path, clientId)) {
    console.warn(`[SECURITY] Blocked unauthorized photo access attempt for client ${clientId}: ${path}`);
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from("client-photos")
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.error("Failed to generate signed URL for path:", path, error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error("Error signing photo URL:", err);
    return null;
  }
}

/**
 * Maps check-in records to include fresh, temporary signed photo URLs.
 */
export async function attachSignedPhotoUrlsToCheckins<T extends {
  photo_front_url?: string | null;
  photo_side_url?: string | null;
  photo_back_url?: string | null;
}>(
  supabase: SupabaseClient,
  checkins: T[],
  clientId: string,
  expiresInSeconds = 7200
): Promise<T[]> {
  if (!checkins || checkins.length === 0) return [];

  return Promise.all(
    checkins.map(async (ci) => {
      const [front, side, back] = await Promise.all([
        ci.photo_front_url ? signPhotoUrl(supabase, ci.photo_front_url, clientId, expiresInSeconds) : null,
        ci.photo_side_url ? signPhotoUrl(supabase, ci.photo_side_url, clientId, expiresInSeconds) : null,
        ci.photo_back_url ? signPhotoUrl(supabase, ci.photo_back_url, clientId, expiresInSeconds) : null,
      ]);

      return {
        ...ci,
        photo_front_url: front,
        photo_side_url: side,
        photo_back_url: back,
      };
    })
  );
}

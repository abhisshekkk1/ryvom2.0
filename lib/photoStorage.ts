import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Extracts the storage path (e.g., 'clients/{clientId}/{filename}') from a photo URL or path.
 */
export function extractPhotoPath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return null;
  let trimmed = pathOrUrl.trim();
  if (!trimmed) return null;

  // If it's already a relative path starting with clients/
  if (trimmed.startsWith("clients/")) {
    return trimmed.split("?")[0];
  }

  // If it contains /client-photos/ or starts with client-photos/
  if (trimmed.includes("/client-photos/")) {
    const parts = trimmed.split("/client-photos/");
    if (parts[1]) {
      return parts[1].split("?")[0];
    }
  } else if (trimmed.startsWith("client-photos/")) {
    trimmed = trimmed.replace(/^client-photos\//, "");
  }

  // Strip any leading slashes
  trimmed = trimmed.replace(/^\/+/, "");

  return trimmed.split("?")[0] || null;
}

/**
 * Checks whether a given string is a valid, loaded HTTP/HTTPS signed URL or data URL.
 * Returns false for raw internal storage paths (e.g. 'clients/...').
 */
export function isSignedPhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  );
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
 * Maps check-in records to include fresh, temporary signed photo URLs using Supabase batch API.
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

  // 1. Collect all unique paths that need signing
  const pathsToSign = new Set<string>();
  for (const ci of checkins) {
    for (const key of ["photo_front_url", "photo_side_url", "photo_back_url"] as const) {
      const val = ci[key];
      if (val) {
        const norm = extractPhotoPath(val);
        if (norm && validatePhotoOwnership(norm, clientId)) {
          pathsToSign.add(norm);
        }
      }
    }
  }

  const pathList = Array.from(pathsToSign);
  const signedUrlMap = new Map<string, string>();

  // 2. Batch sign all photos in ONE request using Supabase createSignedUrls
  if (pathList.length > 0) {
    try {
      const { data, error } = await supabase.storage
        .from("client-photos")
        .createSignedUrls(pathList, expiresInSeconds);

      if (!error && Array.isArray(data)) {
        for (const item of data) {
          if (item?.path && item?.signedUrl) {
            signedUrlMap.set(item.path, item.signedUrl);
          }
        }
      } else if (error) {
        console.warn("Batch photo signing warning:", error);
      }
    } catch (batchErr) {
      console.warn("Batch photo signing error:", batchErr);
    }

    // 3. Fallback for any paths not returned by batch
    for (const path of pathList) {
      if (!signedUrlMap.has(path)) {
        try {
          const { data, error } = await supabase.storage
            .from("client-photos")
            .createSignedUrl(path, expiresInSeconds);
          if (!error && data?.signedUrl) {
            signedUrlMap.set(path, data.signedUrl);
          }
        } catch {
          // Individual fallback failed
        }
      }
    }
  }

  // 4. Map back to checkins - strictly returning signed URLs or null (NEVER raw paths)
  return checkins.map((ci) => {
    const resolveSigned = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      const norm = extractPhotoPath(raw);
      if (!norm) return null;
      return signedUrlMap.get(norm) || null;
    };

    return {
      ...ci,
      photo_front_url: resolveSigned(ci.photo_front_url),
      photo_side_url: resolveSigned(ci.photo_side_url),
      photo_back_url: resolveSigned(ci.photo_back_url),
    };
  });
}

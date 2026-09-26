/**
 * Trainer profile helper utilities:
 * - Fallback resolution for display names across all legacy and new trainer accounts
 * - Validation rules for trainer display names preserving international Unicode names
 */

export interface TrainerUser {
  user_metadata?: Record<string, unknown> | null;
  email?: string | null;
}

/**
 * Resolves a trainer's display name using the priority fallback order:
 * 1. Stored `full_name` or `name` in user metadata
 * 2. Existing profile name if the app/user metadata already has one (`profile_name` or `display_name`)
 * 3. Email local-part as fallback (e.g. "coach.sarah" -> "Coach.sarah")
 * 4. Generic fallback: "Coach"
 */
export function resolveTrainerDisplayName(user: TrainerUser | null | undefined): string {
  if (!user) return "Coach";

  // 1. Stored full_name or name metadata
  const metaFullName = user.user_metadata?.full_name;
  if (typeof metaFullName === "string" && metaFullName.trim().length > 0) {
    return metaFullName.trim();
  }

  const metaName = user.user_metadata?.name;
  if (typeof metaName === "string" && metaName.trim().length > 0) {
    return metaName.trim();
  }

  // 2. Existing profile name metadata if present
  const profileName =
    user.user_metadata?.profile_name || user.user_metadata?.display_name;
  if (typeof profileName === "string" && profileName.trim().length > 0) {
    return profileName.trim();
  }

  // 3. Email local-part as fallback
  if (user.email && typeof user.email === "string") {
    const localPart = user.email.split("@")[0]?.trim();
    if (localPart && localPart.length > 0) {
      return localPart.charAt(0).toUpperCase() + localPart.slice(1);
    }
  }

  return "Coach";
}

export interface DisplayNameValidationResult {
  valid: boolean;
  error?: string;
  trimmed: string;
}

/**
 * Validates a trainer's proposed display name.
 * - Trims whitespace
 * - Required / rejects empty
 * - Max length: 80 characters
 * - Preserves Unicode names (e.g., accents, Cyrillic, Kanji, Devanagari)
 * - Rejects unprintable control characters and strings without letters/numbers
 */
export function validateDisplayName(name: string | null | undefined): DisplayNameValidationResult {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Display name is required.", trimmed: "" };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Display name cannot be empty.", trimmed: "" };
  }

  if (trimmed.length > 80) {
    return {
      valid: false,
      error: "Display name must be 80 characters or fewer.",
      trimmed,
    };
  }

  // Disallow ASCII / Unicode control characters
  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
    return {
      valid: false,
      error: "Display name contains invalid control characters.",
      trimmed,
    };
  }

  // Preserve Unicode names while preventing strings consisting solely of symbols/punctuation
  // \p{L} matches any unicode letter, \p{N} matches any unicode digit
  if (!/\p{L}|\p{N}/u.test(trimmed)) {
    return {
      valid: false,
      error: "Display name must contain at least one letter or number.",
      trimmed,
    };
  }

  return { valid: true, trimmed };
}

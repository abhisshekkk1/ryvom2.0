import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Supabase-supported email OTP verification types
const SUPPORTED_EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "invite",
  "signup",
  "recovery",
  "magiclink",
  "email_change",
  "email",
];

/**
 * Validates and sanitizes the redirection path to prevent open redirect vulnerabilities.
 * Strictly requires internal relative paths starting with a single '/' and never '//' or '/\'.
 */
function getSafeRedirect(rawRedirect: string | null, fallback = "/auth/accept-invite"): string {
  if (!rawRedirect) return fallback;
  const trimmed = rawRedirect.trim();

  // Block protocol-relative URLs (//evil.com), backslash tricks (/\evil.com, /\\evil.com), and absolute schemes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, "http://localhost");
    if (
      url.pathname.startsWith("/") &&
      !url.pathname.startsWith("//") &&
      !url.pathname.startsWith("/\\")
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

/**
 * GET /auth/confirm
 *
 * Handles server-side Supabase email verification (specifically for trainer invitations)
 * via token_hash and type parameters.
 *
 * Establishes the authenticated session in secure HTTP-only cookies before
 * redirecting to /auth/accept-invite.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const redirectParam = searchParams.get("redirect_to") || searchParams.get("next");
  const redirectTo = getSafeRedirect(redirectParam, "/auth/accept-invite");

  // 1. Validate required token_hash
  if (!token_hash) {
    const errorMsg = encodeURIComponent("Missing invitation or verification token.");
    return NextResponse.redirect(new URL(`/login?error=${errorMsg}`, origin));
  }

  // 2. Validate supported OTP type
  if (!type || !SUPPORTED_EMAIL_OTP_TYPES.includes(type)) {
    const errorMsg = encodeURIComponent("Invalid or unsupported verification type.");
    return NextResponse.redirect(new URL(`/login?error=${errorMsg}`, origin));
  }

  try {
    // 3. Obtain server Supabase client with cookie persistence
    const supabase = await createServerSupabase();

    // 4. Verify the OTP server-side
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (error) {
      console.error("Supabase auth/confirm verifyOtp error:", error.message);
      const errorMsg = encodeURIComponent(error.message || "Invitation link is invalid or has expired.");
      return NextResponse.redirect(new URL(`/login?error=${errorMsg}`, origin));
    }

    // 5. Success: redirect to target path with session cookies set
    return NextResponse.redirect(new URL(redirectTo, origin));
  } catch (err: unknown) {
    console.error("Supabase auth/confirm unexpected exception:", err);
    const msg = encodeURIComponent("An error occurred during authentication.");
    return NextResponse.redirect(new URL(`/login?error=${msg}`, origin));
  }
}

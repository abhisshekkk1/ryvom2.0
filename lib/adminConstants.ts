export const PLATFORM_ADMIN_EMAIL = "abhishek0442@gmail.com";

/**
 * Checks whether an email matches the designated platform administrator.
 * Safe for both client and server components.
 */
export function isPlatformAdmin(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL.toLowerCase();
}

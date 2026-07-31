import { supabase } from "./supabase";

export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fileToBase64(file: File): Promise<{ base64Data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64Data] = result.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] || file.type || "image/jpeg";
      resolve({ base64Data, mimeType });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export async function getOrCreatePublicUser(sessionUser: { id?: string; email?: string; username?: string; } | null | undefined): Promise<{
  id: string;
  username: string;
  role: string;
} | null> {
  if (!sessionUser) return null;

  // Extract candidate identifiers
  const emailOrUsername = sessionUser.email || sessionUser.username || "";
  const usernameClean = emailOrUsername.includes("@")
    ? emailOrUsername.split("@")[0].toLowerCase()
    : emailOrUsername.toLowerCase();

  const fallbackId = sessionUser.id || crypto.randomUUID();
  const fallbackUser = { id: fallbackId, username: usernameClean || "Athlete", role: "client" };

  try {
    // 1. Check if user already exists by id in public.users
    if (sessionUser.id) {
      const { data: byId } = await supabase
        .from("users")
        .select("id, username, role")
        .eq("id", sessionUser.id)
        .maybeSingle();

      if (byId) return byId;
    }

    // 2. Check if user already exists by username in public.users
    if (usernameClean) {
      const { data: byUsername } = await supabase
        .from("users")
        .select("id, username, role")
        .eq("username", usernameClean)
        .maybeSingle();

      if (byUsername) return byUsername;
    }

    // 3. IF user does NOT exist: use .upsert() to add them safely
    const { data: upsertedUser } = await supabase
      .from("users")
      .upsert(
        [
          {
            id: fallbackId,
            username: usernameClean || `user_${Date.now()}`,
            password_hash: "auth_managed",
            role: "client",
          },
        ],
        { onConflict: "username" }
      )
      .select("id, username, role")
      .maybeSingle();

    if (upsertedUser) return upsertedUser;
  } catch {
    // Catch network / RLS / DB errors gracefully without failing login
  }

  return fallbackUser;
}

export async function resolveActiveUserId(userProp?: { id?: string; email?: string; username?: string; } | null): Promise<string | null> {
  if (userProp) {
    const publicUser = await getOrCreatePublicUser(userProp);
    if (publicUser?.id) return publicUser.id;
    if (userProp.id) return userProp.id;
  }

  const { data: authData } = await supabase.auth.getSession();
  if (authData?.session?.user) {
    const publicUser = await getOrCreatePublicUser(authData.session.user);
    return publicUser?.id || authData.session.user.id;
  }

  if (typeof window !== "undefined") {
    const savedUser = localStorage.getItem("ryvom_user") || sessionStorage.getItem("ryvom_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed?.id) return parsed.id;
      } catch {
        // ignore
      }
    }
  }

  return null;
}

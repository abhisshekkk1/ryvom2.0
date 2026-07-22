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

export async function getOrCreatePublicUser(sessionUser: any): Promise<{
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

  // 1. Check if user already exists by id in public.users
  if (sessionUser.id) {
    const { data: byId, error: selectIdError } = await supabase
      .from("users")
      .select("id, username, role")
      .eq("id", sessionUser.id)
      .maybeSingle();

    if (selectIdError) {
      console.error("Supabase Error:", JSON.stringify(selectIdError, null, 2));
    }

    if (byId) {
      return byId;
    }
  }

  // Check if user already exists by username in public.users
  if (usernameClean) {
    const { data: byUsername, error: selectNameError } = await supabase
      .from("users")
      .select("id, username, role")
      .eq("username", usernameClean)
      .maybeSingle();

    if (selectNameError) {
      console.error("Supabase Error:", JSON.stringify(selectNameError, null, 2));
    }

    if (byUsername) {
      return byUsername;
    }
  }

  // 2. IF the user does NOT exist: use .upsert() to add them safely
  const newId = sessionUser.id || crypto.randomUUID();
  const newUsername = usernameClean || `user_${Date.now()}`;

  const { data: upsertedUser, error: upsertError } = await supabase
    .from("users")
    .upsert(
      [
        {
          id: newId,
          username: newUsername,
          password_hash: "auth_managed",
          role: "client",
        },
      ],
      { onConflict: "username" }
    )
    .select("id, username, role")
    .maybeSingle();

  if (upsertedUser) {
    return upsertedUser;
  }

  if (upsertError) {
    console.error("Supabase Error:", JSON.stringify(upsertError, null, 2));
  }

  return sessionUser.id ? { id: sessionUser.id, username: newUsername, role: "client" } : null;
}

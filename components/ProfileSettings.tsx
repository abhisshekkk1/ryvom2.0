"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { resolveActiveUserId } from "@/lib/userHelper";

interface ProfileSettingsProps {
  user?: any;
  onProfileSaved?: (profileData: { username: string; bio: string }) => void;
}

export default function ProfileSettings({ user, onProfileSaved }: ProfileSettingsProps) {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [bio, setBio] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch user's existing username and bio on component mount referencing primary key user_id
  useEffect(() => {
    async function loadUserProfile() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const uid = await resolveActiveUserId(user);
        setActiveUserId(uid);

        if (uid) {
          let { data, error } = await supabase
            .from("user_settings")
            .select("*")
            .eq("user_id", uid)
            .limit(1)
            .maybeSingle();

          if (error) {
            console.error("Error fetching profile from user_settings:", error);
            const { data: fallback } = await supabase
              .from("user_settings")
              .select("*")
              .limit(1)
              .maybeSingle();
            data = fallback;
          }

          if (data) {
            if (data.username) setUsername(data.username);
            if (data.bio) setBio(data.bio);
          }
        }
      } catch (err: any) {
        console.error("Profile load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, [user]);

  // 2. Save Profile click/submit handler with username formatting & Supabase upsert
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToastMessage(null);
    setErrorMessage(null);

    // Format username: lowercase & stripped of any '@' symbols
    const cleanUsername = username.toLowerCase().replace(/@/g, "").trim();
    const cleanBio = bio.trim();

    try {
      const uid = activeUserId || (await resolveActiveUserId(user));
      setActiveUserId(uid);

      const payload: any = {
        username: cleanUsername,
        bio: cleanBio,
      };
      if (uid) payload.user_id = uid;

      let { error: upsertError } = await supabase
        .from("user_settings")
        .upsert([payload], { onConflict: "username" });

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        const { error: updateError } = await supabase
          .from("user_settings")
          .update({ username: cleanUsername, bio: cleanBio })
          .ilike("username", cleanUsername);

        if (updateError) throw updateError;
      }

      // Update state with clean username
      setUsername(cleanUsername);

      // Trigger optional parent callback
      if (onProfileSaved) {
        onProfileSaved({ username: cleanUsername, bio: cleanBio });
      }

      // Display success toast notification
      setToastMessage("✓ Profile updated successfully!");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      console.error("Save profile error:", err);
      setErrorMessage(err.message || "Failed to update profile settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-2xl space-y-6">
      {/* Component Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xl">
          👤
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Profile Settings
          </h2>
          <p className="text-xs text-zinc-400">
            Set your public handle and bio for your link-in-bio portfolio
          </p>
        </div>
      </div>

      {/* Success Toast / Notification */}
      {toastMessage && (
        <div className="p-4 rounded-xl text-xs font-bold border bg-emerald-950/40 border-emerald-600/60 text-emerald-300 shadow-lg animate-fade-in flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <span>{toastMessage}</span>
          </div>
          {username && (
            <a
              href={`/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline hover:text-white transition"
            >
              View Public Page →
            </a>
          )}
        </div>
      )}

      {/* Error Message Notification */}
      {errorMessage && (
        <div className="p-4 rounded-xl text-xs font-medium border bg-red-950/30 border-red-800/60 text-rose-400">
          ⚠️ {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="space-y-4 animate-pulse py-4">
          <div className="h-4 bg-zinc-800/60 rounded w-1/4"></div>
          <div className="h-11 bg-zinc-800/60 rounded-xl w-full"></div>
          <div className="h-4 bg-zinc-800/60 rounded w-1/4"></div>
          <div className="h-20 bg-zinc-800/60 rounded-xl w-full"></div>
        </div>
      ) : (
        <form onSubmit={handleSaveProfile} className="space-y-5">
          {/* Username Input Field */}
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2"
            >
              Username
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-zinc-500 font-bold text-sm select-none">
                @
              </span>
              <input
                id="username"
                type="text"
                required
                placeholder="abhisshekkk"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl pl-8 pr-4 py-3 text-sm text-white font-semibold focus:outline-none focus:border-purple-500 transition placeholder:text-zinc-600"
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5">
              Saved in lowercase, stripped of '@' symbols. Used for your portfolio link:{" "}
              <span className="text-purple-400 font-semibold">
                /{username ? username.toLowerCase().replace(/@/g, "") : "username"}
              </span>
            </p>
          </div>

          {/* Bio Textarea Field */}
          <div>
            <label
              htmlFor="bio"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2"
            >
              Bio / Headline
            </label>
            <textarea
              id="bio"
              rows={3}
              placeholder="Documenting the journey from 140kg to 100kg."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-purple-500 transition resize-none placeholder:text-zinc-600 leading-relaxed"
            />
          </div>

          {/* Prominent Save Profile Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-purple-600/20 text-sm flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Saving Profile...</span>
                </>
              ) : (
                <span>Save Profile</span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

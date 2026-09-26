"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isPlatformAdmin } from "@/lib/adminConstants";
import { resolveTrainerDisplayName, validateDisplayName } from "@/lib/profile";

export default function SettingsPage() {
  const router = useRouter();

  // Profile section state
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("Coach");
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password section state
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        if (data.user.email) {
          setEmail(data.user.email);
          if (isPlatformAdmin(data.user.email)) {
            setRole("Platform Admin");
          }
        }
        setDisplayName(resolveTrainerDisplayName(data.user));
      }
    });
  }, []);

  async function handleSaveProfile(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const validation = validateDisplayName(displayName);
    if (!validation.valid) {
      setProfileError(validation.error || "Please enter a valid display name.");
      setProfileMessage(null);
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const supabase = createBrowserSupabase();
      const { data, error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: validation.trimmed,
        },
      });

      if (authError) {
        throw authError;
      }

      setDisplayName(validation.trimmed);
      setProfileMessage("Display name updated successfully.");

      // Notify Sidebar and other listening components immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ryvom:profile-updated", {
            detail: {
              name: validation.trimmed,
              user: data.user,
            },
          })
        );
      }

      router.refresh();
    } catch (err: unknown) {
      setProfileError(
        err instanceof Error ? err.message : "Failed to update profile name."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordMessage(null);
    try {
      const supabase = createBrowserSupabase();
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (authError) throw authError;
      setPasswordMessage("Password updated successfully.");
      setNewPassword("");
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to update password."
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <main className="flex-1">
          <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-[#09090b]/90 px-5 py-4 backdrop-blur md:px-8">
            <div className="pl-12 lg:pl-0">
              <h1 className="text-lg font-semibold">Settings</h1>
              <p className="text-xs text-zinc-500">
                Manage your coach account settings.
              </p>
            </div>
          </header>

          <div className="mx-auto max-w-xl p-5 md:p-8 space-y-8">
            {/* Profile Section */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-white">Profile</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Your trainer profile</p>
              </div>

              {profileError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
                >
                  {profileError}
                </div>
              )}
              {profileMessage && (
                <div
                  role="status"
                  className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
                >
                  {profileMessage}
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label
                    htmlFor="trainer-display-name"
                    className="block text-xs font-medium text-zinc-400 mb-1.5"
                  >
                    Display name
                  </label>
                  <input
                    id="trainer-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (profileError) setProfileError(null);
                    }}
                    maxLength={80}
                    placeholder="Enter your name"
                    disabled={savingProfile}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors disabled:opacity-50"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Email
                  </span>
                  <div className="w-full rounded-xl border border-zinc-800/70 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-400 select-all cursor-not-allowed">
                    {email || "—"}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Role
                  </span>
                  <div className="w-full rounded-xl border border-zinc-800/70 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-400">
                    {role}
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={savingProfile || !displayName.trim()}
                    className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {savingProfile ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>

            {/* Change Password */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5">
              <h3 className="mb-4 text-sm font-semibold">Change Password</h3>
              {passwordError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
                >
                  {passwordError}
                </div>
              )}
              {passwordMessage && (
                <div
                  role="status"
                  className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
                >
                  {passwordMessage}
                </div>
              )}
              <div className="space-y-3">
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type="password"
                  placeholder="New password (min 6 characters)"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-zinc-600 transition-colors"
                />
                <button
                  onClick={handleChangePassword}
                  disabled={savingPassword}
                  className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {savingPassword ? "Saving…" : "Update password"}
                </button>
              </div>
            </div>

            {/* Logout */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5">
              <h3 className="mb-4 text-sm font-semibold">Session</h3>
              <button
                onClick={handleLogout}
                className="rounded-xl border border-red-900/50 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

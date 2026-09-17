"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createBrowserSupabase();
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (authError) throw authError;
      setMessage("Password updated successfully.");
      setNewPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update password."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Sidebar />

      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-[#09090b]/90 px-5 py-4 backdrop-blur md:px-8">
          <div className="pl-12 lg:pl-0">
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-zinc-500">
              Manage your coach account settings.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-xl p-5 md:p-8 space-y-8">
          {/* Account Info */}
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5">
            <h3 className="mb-4 text-sm font-semibold">Account</h3>
            <div className="flex justify-between border-t border-zinc-800/70 py-3 text-sm">
              <span className="text-zinc-500">Email</span>
              <span className="font-medium text-zinc-300">
                abhishek0442@gmail.com
              </span>
            </div>
            <div className="flex justify-between border-t border-zinc-800/70 py-3 text-sm">
              <span className="text-zinc-500">Role</span>
              <span className="font-medium text-zinc-300">Coach</span>
            </div>
          </div>

          {/* Change Password */}
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5">
            <h3 className="mb-4 text-sm font-semibold">Change Password</h3>
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {message && (
              <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {message}
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
                disabled={saving}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Update password"}
              </button>
            </div>
          </div>

          {/* Logout */}
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5">
            <h3 className="mb-4 text-sm font-semibold">Session</h3>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-red-900/50 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-950/30 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

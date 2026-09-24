"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { PLATFORM_ADMIN_EMAIL, isPlatformAdmin } from "@/lib/adminConstants";
import type { AdminTrainerItem } from "@/app/api/admin/trainers/route";
import {
  UserPlus,
  Mail,
  Calendar,
  CheckCircle2,
  Clock3,
  AlertTriangle,
} from "lucide-react";

export default function TrainersPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [trainers, setTrainers] = useState<AdminTrainerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite Modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const checkAdminAndLoad = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getUser();

      const userEmail = data.user?.email;
      if (!isPlatformAdmin(userEmail)) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      const res = await fetch("/api/admin/trainers");
      if (!res.ok) {
        if (res.status === 403) {
          setIsAdmin(false);
          return;
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to load trainers");
      }

      const json = await res.json();
      setTrainers(json.trainers || []);
    } catch (err: unknown) {
      console.error("Load trainers error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load trainers"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAdminAndLoad();
  }, [checkAdminAndLoad]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    if (!name.trim() || !email.trim()) {
      setInviteError("Name and email are required.");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/admin/trainers/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to send invitation.");
      }

      setInviteSuccess(`Invitation sent to ${email.trim().toLowerCase()}!`);
      setName("");
      setEmail("");
      // Refresh list
      void checkAdminAndLoad();
    } catch (err: unknown) {
      console.error("Invite error:", err);
      setInviteError(
        err instanceof Error ? err.message : "Failed to send invitation."
      );
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-[#09090b]/90 px-5 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between pl-12 lg:pl-0">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">Trainers</h1>
                <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-400/20">
                  Platform Admin
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Manage personal trainers and send invitations.
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={() => {
                  setInviteError(null);
                  setInviteSuccess(null);
                  setShowInviteModal(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer shadow-sm"
              >
                <UserPlus size={15} />
                <span>Invite Trainer</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-5 md:p-8 space-y-6 max-w-5xl">
          {loading ? (
            <LoadingState message="Loading trainers list…" />
          ) : isAdmin === false ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center max-w-lg mx-auto my-12">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 mb-4 border border-rose-500/20">
                <AlertTriangle size={24} />
              </div>
              <h2 className="text-base font-bold text-white mb-2">
                Access Denied
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                This page is restricted to the platform administrator (
                {PLATFORM_ADMIN_EMAIL}). Individual trainers manage their own
                clients and cannot access trainer administration.
              </p>
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={checkAdminAndLoad} />
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Total Accounts
                  </div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {trainers.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Active Trainers
                  </div>
                  <div className="mt-1 text-2xl font-bold text-emerald-400">
                    {trainers.filter((t) => t.status === "active").length}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Pending Invitations
                  </div>
                  <div className="mt-1 text-2xl font-bold text-amber-400">
                    {trainers.filter((t) => t.status === "invited").length}
                  </div>
                </div>
              </div>

              {/* Trainers List */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="border-b border-zinc-800/80 px-5 py-3.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">
                    Registered & Invited Trainers ({trainers.length})
                  </span>
                </div>

                {trainers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    No trainers invited yet. Click &quot;Invite Trainer&quot; to send an invitation.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/60">
                    {trainers.map((t) => (
                      <div
                        key={t.id}
                        className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center font-bold text-xs text-zinc-200 shrink-0">
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-zinc-100 truncate">
                                {t.name}
                              </span>
                              {t.email.toLowerCase() ===
                                PLATFORM_ADMIN_EMAIL.toLowerCase() && (
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                              <Mail size={12} className="text-zinc-500 shrink-0" />
                              <span>{t.email}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 sm:shrink-0 text-xs">
                          <div className="flex items-center gap-1.5 text-zinc-500">
                            <Calendar size={12} />
                            <span>
                              {new Date(
                                t.invited_at || t.created_at
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              t.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {t.status === "active" ? (
                              <CheckCircle2 size={11} />
                            ) : (
                              <Clock3 size={11} />
                            )}
                            {t.status === "active" ? "Active" : "Invited"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Invite Trainer Modal */}
      <Modal
        open={showInviteModal}
        title="Invite Personal Trainer"
        onClose={() => setShowInviteModal(false)}
      >
          <form onSubmit={handleInvite} className="space-y-4">
            <p className="text-xs text-zinc-400">
              Enter the trainer&apos;s full name and email address. An invitation email
              with a secure setup link will be dispatched automatically via Supabase.
            </p>

            {inviteError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                {inviteSuccess}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Trainer Full Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-zinc-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Trainer Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trainer@example.com"
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-zinc-500 transition-colors"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {inviting ? "Sending Invitation…" : "Send Invitation"}
              </button>
            </div>
          </form>
        </Modal>
    </div>
  );
}

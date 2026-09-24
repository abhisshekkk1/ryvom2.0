"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Eye, EyeOff, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Check current session
    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (userError || !data?.user) {
        // If not immediately available, listen for auth state change (e.g. from hash parsing)
        const { data: authListener } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (session?.user) {
              setUserEmail(session.user.email || null);
              const metaName =
                session.user.user_metadata?.full_name ||
                session.user.user_metadata?.name;
              setUserName(
                typeof metaName === "string" ? metaName : null
              );
              setLoading(false);
            }
          }
        );

        // Fallback after 2.5s if no session was exchanged
        const timer = setTimeout(() => {
          setLoading(false);
        }, 2500);

        return () => {
          authListener.subscription.unsubscribe();
          clearTimeout(timer);
        };
      } else {
        setUserEmail(data.user.email || null);
        const metaName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name;
        setUserName(typeof metaName === "string" ? metaName : null);
        setLoading(false);
      }
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      // Wait 1.5s to display success feedback, then redirect to empty dashboard
      setTimeout(() => {
        router.replace("/");
      }, 1500);
    } catch (err: unknown) {
      console.error("Password update error:", err);
      const msg =
        err instanceof Error ? err.message : "Failed to establish password.";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Image
              src="/logo_small.jpg"
              alt="Ryvom"
              width={44}
              height={44}
              className="rounded-xl"
            />
            <span className="text-2xl font-black tracking-[0.2em]">RYVOM</span>
          </div>
          <div className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
            <ShieldCheck size={13} />
            Trainer Invitation
          </div>
          <h1 className="text-2xl font-black">Welcome to Ryvom</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Set your password to activate your personal trainer workspace.
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          {loading ? (
            <div className="py-12 text-center text-sm text-zinc-400 animate-pulse">
              Verifying your invitation…
            </div>
          ) : !userEmail ? (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertCircle size={22} />
              </div>
              <h2 className="text-base font-bold text-zinc-100">
                Invitation Not Detected
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
                No active invitation session was found. Please make sure you
                clicked the link directly from your invitation email, or contact
                your platform administrator.
              </p>
              <button
                onClick={() => router.push("/login")}
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          ) : success ? (
            <div className="text-center py-6 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={24} />
              </div>
              <h2 className="text-base font-bold text-zinc-100">
                Account Activated!
              </h2>
              <p className="text-xs text-zinc-400">
                Your password has been saved. Loading your dashboard…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 text-xs">
                <span className="text-zinc-500 block">Trainer Account:</span>
                <span className="font-semibold text-zinc-200">
                  {userName ? `${userName} (${userEmail})` : userEmail}
                </span>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs font-medium text-zinc-300">
                  Create Password
                </label>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    placeholder="Min 6 characters"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 pr-11 text-sm outline-none focus:border-zinc-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-zinc-300">
                  Confirm Password
                </label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="Repeat your password"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-amber-400 py-3 font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50 transition-colors cursor-pointer mt-2"
              >
                {submitting ? "Activating Account…" : "Activate & Enter Ryvom"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

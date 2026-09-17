"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { createBrowserClient } from "@supabase/ssr";

const COACH_EMAIL = "abhishek0442@gmail.com";

const getSupabase = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function LoginPage() {
  const [email, setEmail] = useState(COACH_EMAIL);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (data.user?.email?.toLowerCase() === COACH_EMAIL) window.location.replace("/");
    });
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (authError) setError(authError);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (email.trim().toLowerCase() !== COACH_EMAIL) {
      setError("This is a private Ryvom coach account.");
      setLoading(false);
      return;
    }
    if (!password) {
      setError("Enter your password.");
      setLoading(false);
      return;
    }

    try {
      const { data, error: authError } = await getSupabase().auth.signInWithPassword({
        email: COACH_EMAIL,
        password,
      });
      if (authError) throw authError;
      if (data.user?.email?.toLowerCase() !== COACH_EMAIL || !data.session) {
        await getSupabase().auth.signOut();
        throw new Error("This account is not authorized for Ryvom Coach.");
      }
      window.location.replace("/");
    } catch (err: unknown) {
      console.error("Ryvom auth error:", err);
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg.toLowerCase().includes("invalid login credentials") ? "Incorrect password." : msg);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const { error: authError } = await getSupabase().auth.resetPasswordForEmail(COACH_EMAIL, {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings/update-password`,
      });
      if (authError) throw authError;
      setMessage("Password reset link sent to your coach email.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Image src="/logo_small.jpg" alt="Ryvom" width={44} height={44} className="rounded-xl" />
            <span className="text-2xl font-black tracking-[0.2em]">RYVOM</span>
          </div>
          <div className="mx-auto mb-3 inline-flex rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Private Coach Access</div>
          <h1 className="text-3xl font-black">Welcome back</h1>
          <p className="text-sm text-zinc-400 mt-2">Your private coaching workspace.</p>
        </div>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          {message && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">Coach email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" required className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-zinc-500" placeholder="••••••••" />
            </div>
            <button disabled={loading} className="w-full rounded-xl bg-white py-3 font-bold text-black hover:bg-zinc-200 disabled:opacity-50">{loading ? "Signing in..." : "Enter Ryvom"}</button>
          </form>
          <button onClick={resetPassword} disabled={loading} className="mt-4 w-full text-sm text-zinc-400 hover:text-white">Forgot password?</button>
          <p className="mt-5 border-t border-zinc-800 pt-5 text-center text-xs leading-5 text-zinc-600">Private workspace · No public accounts · Coach access only</p>
        </section>
      </div>
    </main>
  );
}

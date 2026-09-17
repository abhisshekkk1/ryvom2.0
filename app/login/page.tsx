"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { createBrowserClient } from "@supabase/ssr";

const getSupabase = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (authError) setError(authError);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    const targetEmail = email.trim();
    if (!targetEmail || !password) { setError("Please enter both email address and password."); setLoading(false); return; }
    try {
      const supabase = getSupabase();
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: targetEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (authError) throw authError;
        if (data.session) { window.location.replace("/"); return; }
        setMessage("Account created. Check your email to confirm your account, then log in.");
        setMode("login");
        return;
      }
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: targetEmail, password });
      if (authError) throw authError;
      if (!data.session) throw new Error("Login succeeded but no session was created.");
      window.location.replace("/");
    } catch (err: unknown) {
      console.error("Ryvom auth error:", err);
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg.toLowerCase().includes("invalid login credentials") ? "Incorrect email address or password." : msg);
    } finally { setLoading(false); }
  }

  async function googleLogin() {
    setGoogleLoading(true); setError(null);
    try {
      const { error: authError } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setGoogleLoading(false);
    }
  }

  async function resetPassword() {
    setError(null); setMessage(null);
    const targetEmail = email.trim();
    if (!targetEmail) { setError("Enter your email address first."); return; }
    setLoading(true);
    try {
      const { error: authError } = await getSupabase().auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings/update-password`,
      });
      if (authError) throw authError;
      setMessage("Password reset link sent. Check your email.");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Could not send reset email."); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-6"><Image src="/logo_small.jpg" alt="Ryvom" width={44} height={44} className="rounded-xl" /><span className="text-2xl font-black tracking-[0.2em]">RYVOM</span></div>
          <h1 className="text-3xl font-black">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-zinc-400 mt-2">Coach-led fitness, all in one place.</p>
        </div>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          {message && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div><label className="mb-2 block text-sm font-medium text-zinc-300">Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" required className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500" placeholder="you@example.com" /></div>
            <div><label className="mb-2 block text-sm font-medium text-zinc-300">Password</label><input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500" placeholder="••••••••" /></div>
            <button disabled={loading || googleLoading} className="w-full rounded-xl bg-red-500 py-3 font-bold hover:bg-red-400 disabled:opacity-50">{loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
          </form>
          {mode === "login" && <button onClick={resetPassword} disabled={loading} className="mt-4 w-full text-sm text-zinc-400 hover:text-white">Forgot password?</button>}
          <div className="my-5 flex items-center gap-3 text-xs text-zinc-600"><span className="h-px flex-1 bg-zinc-800" />OR<span className="h-px flex-1 bg-zinc-800" /></div>
          <button onClick={googleLogin} disabled={loading || googleLoading} className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 font-semibold hover:bg-zinc-800 disabled:opacity-50">{googleLoading ? "Connecting to Google..." : "Continue with Google"}</button>
          <p className="mt-6 text-center text-sm text-zinc-400">{mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}<button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setMessage(null); }} className="font-semibold text-red-400 hover:text-red-300">{mode === "login" ? "Create one" : "Log in"}</button></p>
        </section>
      </div>
    </main>
  );
}

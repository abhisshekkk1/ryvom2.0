"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { hashPassword, getOrCreatePublicUser } from "@/lib/userHelper";

export default function Auth({ onLoginSuccess }: { onLoginSuccess?: (user: any) => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const identifier = email.trim();

    try {
      if (isSignUp) {
        // Standard Supabase Auth SignUp
        const { error, data } = await supabase.auth.signUp({
          email: identifier,
          password,
        });

        if (error) throw error;

        if (data?.user) {
          const publicUser = await getOrCreatePublicUser(data.user);
          const fullUser = {
            id: publicUser?.id || data.user.id,
            email: data.user.email,
            username: publicUser?.username || identifier.split("@")[0],
            role: publicUser?.role || "client",
          };
          localStorage.setItem("ryvom_user", JSON.stringify(fullUser));
          if (onLoginSuccess) onLoginSuccess(fullUser);
          window.location.reload();
        } else {
          setMessage({ type: "success", text: "Sign up successful! Please check your email or sign in." });
        }
      } else {
        // 1. First check custom public.users table (prototype database logic matching app.py)
        const usernameClean = identifier.includes("@") ? identifier.split("@")[0].toLowerCase() : identifier.toLowerCase();
        const hashedInput = await hashPassword(password);

        const { data: customUsers } = await supabase
          .from("users")
          .select("id, username, password_hash, role")
          .or(`username.eq.${usernameClean},username.eq.${identifier.toLowerCase()}`);

        if (customUsers && customUsers.length > 0) {
          const matchedUser = customUsers.find(
            (u) => u.password_hash === hashedInput || u.password_hash === password
          );

          if (matchedUser) {
            const userObj = {
              id: matchedUser.id,
              username: matchedUser.username,
              role: matchedUser.role,
              email: `${matchedUser.username}@ryvom.local`,
            };
            localStorage.setItem("ryvom_user", JSON.stringify(userObj));
            setMessage({ type: "success", text: "Logged in successfully!" });
            if (onLoginSuccess) onLoginSuccess(userObj);
            window.location.reload();
            return;
          }
        }

        // 2. Fallback to Supabase Auth
        const { error, data } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
        });

        if (error) throw error;

        if (data?.user) {
          const publicUser = await getOrCreatePublicUser(data.user);
          const userObj = {
            id: publicUser?.id || data.user.id,
            email: data.user.email,
            username: publicUser?.username || identifier.split("@")[0],
            role: publicUser?.role || "client",
          };
          localStorage.setItem("ryvom_user", JSON.stringify(userObj));
          setMessage({ type: "success", text: "Logged in successfully!" });
          if (onLoginSuccess) onLoginSuccess(userObj);
          window.location.reload();
        }
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An authentication error occurred." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-tr from-[#ff334b] to-[#ff5b6e] items-center justify-center font-black text-white text-xl shadow-lg shadow-[#ff334b]/20">
            R
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>
          <p className="text-xs text-zinc-400">
            {isSignUp ? "Sign up to start tracking your gains" : "Sign in to access your dashboard"}
          </p>
        </div>

        {message && (
          <div
            className={`p-4 rounded-xl text-xs font-medium border ${
              message.type === "success"
                ? "bg-emerald-950/20 border-emerald-800/50 text-emerald-400"
                : "bg-red-950/20 border-red-900/50 text-[#ff334b]"
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Username or Email
            </label>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. abhishek or yashvigoesjim"
              className="w-full bg-[#24242c] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff334b] transition placeholder-zinc-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#24242c] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff334b] transition placeholder-zinc-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#ff334b] hover:bg-[#e02d41] disabled:bg-[#ff334b]/50 text-white font-bold rounded-xl transition shadow-lg shadow-[#ff334b]/10 active:scale-[0.98] text-sm"
          >
            {loading ? "Authenticating..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage(null);
            }}
            className="text-xs text-zinc-400 hover:text-white transition"
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

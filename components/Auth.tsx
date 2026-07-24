"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { supabase } from "@/lib/supabase";
import { hashPassword, getOrCreatePublicUser } from "@/lib/userHelper";

// Modern SVG Icon for Google OAuth Button
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

export default function Auth({ onLoginSuccess }: { onLoginSuccess?: (user: any) => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Handle Google OAuth Sign In using @supabase/ssr createBrowserClient
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setMessage(null);
    try {
      if (!rememberMe) {
        sessionStorage.setItem("ryvom_remember_me", "false");
      } else {
        localStorage.setItem("ryvom_remember_me", "true");
      }

      const supabaseBrowser = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kfhwmkmxxdzgeeyuxizx.supabase.co",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_mK-ZCLEZoRQNVMpHRuyjhw_3Cb8zyg7"
      );

      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      console.error("Google OAuth error:", err);
      setMessage({ type: "error", text: err.message || "Failed to sign in with Google." });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const identifier = email.trim();
    const activeStorage = rememberMe ? localStorage : sessionStorage;

    // Clear opposite storage mechanism
    if (rememberMe) {
      sessionStorage.removeItem("ryvom_user");
    } else {
      localStorage.removeItem("ryvom_user");
    }

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
          activeStorage.setItem("ryvom_user", JSON.stringify(fullUser));
          if (onLoginSuccess) onLoginSuccess(fullUser);
          window.location.reload();
        } else {
          setMessage({ type: "success", text: "Sign up successful! Please check your email or sign in." });
        }
      } else {
        // 1. First check custom public.users table (prototype database logic)
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
            activeStorage.setItem("ryvom_user", JSON.stringify(userObj));
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
          activeStorage.setItem("ryvom_user", JSON.stringify(userObj));
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
        
        {/* Header */}
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

        {/* Status Notification Message */}
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

        {/* 1. Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full py-3 px-4 rounded-xl bg-[#1b1b22] hover:bg-[#24242c] border border-zinc-700/80 text-white font-bold text-sm transition shadow-md flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
        >
          <GoogleIcon />
          <span>{googleLoading ? "Redirecting to Google..." : "Continue with Google"}</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-zinc-800" />
          <span className="absolute bg-[#121216] px-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
            Or continue with email
          </span>
        </div>

        {/* 2. Standard Email/Password Form */}
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
              placeholder="e.g. johndoe or john@example.com"
              className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff334b] transition placeholder-zinc-500 font-medium"
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
              className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff334b] transition placeholder-zinc-500 font-medium"
            />
          </div>

          {/* 3. Keep me logged in checkbox */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-[#0b0b0e] text-[#ff334b] focus:ring-[#ff334b] focus:ring-offset-0 cursor-pointer accent-[#ff334b]"
              />
              <span>Keep me logged in on this computer</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-3.5 bg-gradient-to-r from-[#ff334b] to-[#ff5b6e] hover:from-[#e02d41] hover:to-[#e04558] disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-[#ff334b]/20 active:scale-[0.98] text-sm mt-2"
          >
            {loading ? "Authenticating..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        {/* Toggle Sign Up / Sign In */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage(null);
            }}
            className="text-xs text-zinc-400 hover:text-white transition font-medium"
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

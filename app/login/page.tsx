"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createBrowserClient } from "@supabase/ssr";
import { getOrCreatePublicUser } from "@/lib/userHelper";

// Official Google Color SVG Icon
const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24">
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

export default function LoginPage() {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const isSignUp = authMode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Read URL query parameters for error messages safely on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      if (err) {
        Promise.resolve().then(() => setErrorMessage(decodeURIComponent(err)));
      }
    }
  }, []);

  const getSupabaseBrowser = () => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  };

  // Handle Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setErrorMessage(null);
    try {
      if (rememberMe) {
        localStorage.setItem("ryvom_remember_me", "true");
      } else {
        sessionStorage.setItem("ryvom_remember_me", "false");
      }

      const supabaseBrowser = getSupabaseBrowser();
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      console.error("Google OAuth error:", err);
      const msg = err instanceof Error ? err.message : "Failed to sign in with Google.";
      setErrorMessage(msg);
      setGoogleLoading(false);
    }
  };

  // Handle Forgot Password reset link email
  const handleForgotPassword = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      setErrorMessage("Please enter your email address first to reset your password.");
      setResetSuccessMessage(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setResetSuccessMessage(null);

    try {
      const supabaseBrowser = getSupabaseBrowser();
      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings/update-password`,
      });

      if (error) throw error;

      setResetSuccessMessage("Password reset link sent to your email!");
    } catch (err: unknown) {
      console.error("Password reset error:", err);
      const msg = err instanceof Error ? err.message : "Failed to send password reset email.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle form login or sign up
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetEmail = email.trim();
    if (!targetEmail || !password) {
      setErrorMessage("Please enter both email address and password.");
      setLoading(false);
      return;
    }

    const activeStorage = rememberMe ? localStorage : sessionStorage;

    if (rememberMe) {
      sessionStorage.removeItem("ryvom_user");
      localStorage.setItem("ryvom_remember_me", "true");
    } else {
      localStorage.removeItem("ryvom_user");
      sessionStorage.setItem("ryvom_remember_me", "false");
    }

    const supabaseBrowser = getSupabaseBrowser();

    try {
      if (isSignUp) {
        // Sign Up flow using Supabase Auth with cookie persistence
        const { data, error } = await supabaseBrowser.auth.signUp({
          email: targetEmail,
          password,
        });

        if (error) throw error;

        if (data?.user) {
          const publicUser = await getOrCreatePublicUser(data.user);
          const userObj = {
            id: publicUser?.id || data.user.id,
            email: data.user.email || targetEmail,
            username: publicUser?.username || targetEmail.split("@")[0],
            role: publicUser?.role || "client",
          };
          activeStorage.setItem("ryvom_user", JSON.stringify(userObj));
          document.cookie = "ryvom_user=true; path=/; max-age=31536000; SameSite=Lax";
          setSuccessMessage("Account created successfully! Redirecting to dashboard...");
          setTimeout(() => {
            window.location.href = "/";
          }, 300);
        } else {
          setSuccessMessage("Account created! Please sign in with your new credentials.");
          setAuthMode("login");
        }
      } else {
        // Sign In flow using Supabase Auth
        const { data, error } = await supabaseBrowser.auth.signInWithPassword({
          email: targetEmail,
          password,
        });

        if (error) throw error;

        if (data?.user) {
          const publicUser = await getOrCreatePublicUser(data.user);
          const userObj = {
            id: publicUser?.id || data.user.id,
            email: data.user.email || targetEmail,
            username: publicUser?.username || targetEmail.split("@")[0] || "Athlete",
            role: publicUser?.role || "client",
          };
          activeStorage.setItem("ryvom_user", JSON.stringify(userObj));
          document.cookie = "ryvom_user=true; path=/; max-age=31536000; SameSite=Lax";
          setSuccessMessage("Logged in successfully! Redirecting...");
          setTimeout(() => {
            window.location.href = "/";
          }, 200);
        }
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      let msg = err instanceof Error ? err.message : "Authentication failed. Please check your credentials.";
      if (msg.includes("Invalid login credentials") || msg.includes("User not found")) {
        msg = "Incorrect email address or password. If you don't have an account yet, click 'Create an account' below.";
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-[#0d0d0d] text-white font-sans antialiased select-none overflow-x-hidden">
      
      {/* LEFT COLUMN (Hero & Features - DESKTOP ONLY 50% SPLIT) */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 lg:p-16 relative bg-neutral-900 border-r border-[#24242c] overflow-hidden min-h-screen">
        
        {/* Background Fitness Model Image with Dark Gradients */}
        <div className="absolute inset-0 z-0 bg-[url('/login_bg.png')] bg-cover bg-center opacity-40 transform scale-105" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0d0d0d]/40 via-[#0d0d0d]/75 to-[#0d0d0d]/95" />

        {/* Laser Red Accent Lines */}
        <div
          className="absolute top-0 left-[25%] w-[2px] h-[120%] bg-[#ff334b] pointer-events-none z-10 opacity-35"
          style={{
            boxShadow: "0 0 10px #ff334b, 0 0 25px #ff334b, 0 0 50px #ff334b",
            transform: "rotate(25deg)",
          }}
        />
        <div
          className="absolute bottom-0 right-[15%] w-[1px] h-[80%] bg-[#ff334b] pointer-events-none z-10 opacity-25"
          style={{
            boxShadow: "0 0 8px #ff334b, 0 0 20px #ff334b",
            transform: "rotate(-15deg)",
          }}
        />

        {/* Left Column Content Wrapper */}
        <div className="relative z-20 h-full flex flex-col justify-between space-y-10">
          
          {/* Top Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff334b] to-[#c62828] p-[1.5px] flex items-center justify-center shadow-lg shadow-[#ff334b]/20">
              <Image
                src="/logo_small.jpg"
                alt="Ryvom Logo"
                width={38}
                height={38}
                className="object-cover rounded-xl"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="text-white font-black text-xl">R</span>
            </div>
            <span className="text-2xl font-black tracking-widest text-white uppercase">
              RYVOM
            </span>
          </div>

          {/* Main Headline & Subtitle */}
          <div className="space-y-4 my-auto">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white uppercase leading-none">
              YOUR FITNESS.
              <span className="block text-[#ff334b] mt-2">OUR MISSION.</span>
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed max-w-md">
              Ryvom is your all-in-one platform to track nutrition, workouts, progress and stay connected with your coach.
            </p>

            {/* Feature List */}
            <div className="space-y-5 pt-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#ff334b]/10 border border-[#ff334b]/25 flex items-center justify-center text-[#ff334b] shrink-0 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white tracking-wide">Track Your Progress</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-normal">
                    Monitor your workouts, nutrition and daily goals.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#ff334b]/10 border border-[#ff334b]/25 flex items-center justify-center text-[#ff334b] shrink-0 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white tracking-wide">Personalized Coaching</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-normal">
                    Get feedback and guidance from your coach.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#ff334b]/10 border border-[#ff334b]/25 flex items-center justify-center text-[#ff334b] shrink-0 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white tracking-wide">Achieve Your Goals</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-normal">
                    Stay consistent. Stay motivated. Be your best.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center gap-2 pt-4">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff334b] shadow-sm shadow-[#ff334b]" />
            <div className="w-2 h-2 rounded-full bg-[#24242c]" />
            <div className="w-2 h-2 rounded-full bg-[#24242c]" />
          </div>

        </div>
      </div>

      {/* RIGHT COLUMN (Login Portal - 50% Desktop, 100% Mobile) */}
      <div className="flex w-full lg:w-1/2 flex-col justify-between items-center p-6 sm:p-10 lg:p-12 min-h-screen overflow-y-auto bg-[#0d0d0d]">
        
        {/* Main Form Center Container */}
        <div className="w-full max-w-md my-auto flex flex-col justify-center py-6">
          
          {/* Mobile Logo Header */}
          <div className="flex lg:hidden flex-col items-center justify-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff334b] to-[#c62828] p-[2px] flex items-center justify-center mb-2 shadow-lg shadow-[#ff334b]/30">
              <Image
                src="/logo_small.jpg"
                alt="Ryvom Logo"
                width={44}
                height={44}
                className="object-cover rounded-2xl"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="text-white font-black text-2xl">R</span>
            </div>
            <span className="text-xl font-black tracking-widest text-white uppercase">RYVOM</span>
          </div>

          {/* Form Header Text */}
          <div className="text-center mb-6 animate-fade-in-up">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {isSignUp ? "Create an Account" : "Welcome Back!"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
              {isSignUp ? "Sign up to start tracking your workouts and nutrition" : "Login to continue your journey"}
            </p>
          </div>

          {/* Notifications */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl text-xs font-medium bg-red-950/40 border border-red-800/60 text-[#ff334b] flex items-center gap-2 animate-fade-in-up">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3.5 rounded-xl text-xs font-medium bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 flex items-center gap-2 animate-fade-in-up">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          {/* Segmented Auth Mode Tabs */}
          <div className="relative flex border-b border-[#24242c] mb-6 animate-fade-in-up">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setErrorMessage(null);
                setSuccessMessage(null);
                setResetSuccessMessage(null);
              }}
              className={`flex-1 py-3 text-center text-xs font-bold transition-colors duration-200 cursor-pointer ${
                authMode === "login" ? "text-[#ff334b]" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setErrorMessage(null);
                setSuccessMessage(null);
                setResetSuccessMessage(null);
              }}
              className={`flex-1 py-3 text-center text-xs font-bold transition-colors duration-200 cursor-pointer ${
                authMode === "signup" ? "text-[#ff334b]" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Sign Up
            </button>

            {/* Red Sliding Indicator */}
            <div
              className="absolute bottom-0 h-[2px] bg-[#ff334b] transition-transform duration-300 ease-out"
              style={{
                width: "50%",
                transform: authMode === "login" ? "translateX(0%)" : "translateX(100%)",
              }}
            />
          </div>

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            
            {/* Email Address Input */}
            <div className="animate-fade-in-up">
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-slate-500 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setResetSuccessMessage(null);
                  }}
                  placeholder="Email Address"
                  autoComplete="email"
                  className="w-full bg-[#18181e] border border-[#24242c] rounded-xl pl-11 pr-4 py-3 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-[#ff334b] transition-all duration-200"
                />
              </div>

              {/* Inline Reset Success Message */}
              {resetSuccessMessage && (
                <p className="text-xs text-emerald-400 font-medium mt-1.5 flex items-center gap-1.5 animate-fade-in-up">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>{resetSuccessMessage}</span>
                </p>
              )}
            </div>

            {/* Password Input */}
            <div className="animate-fade-in-up">
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-slate-500 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  className="w-full bg-[#18181e] border border-[#24242c] rounded-xl pl-11 pr-11 py-3 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-[#ff334b] transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 text-slate-500 hover:text-slate-300 focus:outline-none"
                  aria-label="Toggle Password Visibility"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4 text-[#ff334b]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Options: Remember me & Forgot password */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 pb-1 animate-fade-in-up">
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[#24242c] bg-[#18181e] accent-[#ff334b] cursor-pointer"
                />
                <span className="group-hover:text-slate-300 transition-colors">Remember me</span>
              </label>

              {authMode === "login" && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[#ff334b] hover:underline font-medium transition-all cursor-pointer"
                >
                  Forgot Password?
                </button>
              )}
            </div>

            {/* Primary Submit Button */}
            <div className="animate-fade-in-up">
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#ff334b] to-[#c62828] text-white font-bold text-sm tracking-wide shadow-lg shadow-[#ff334b]/20 hover:shadow-[0_0_25px_rgba(255,51,75,0.5)] hover:scale-[1.015] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>{isSignUp ? "Creating Account..." : "Authenticating..."}</span>
                  </>
                ) : (
                  <span>{authMode === "login" ? "Login" : "Sign Up"}</span>
                )}
              </button>
            </div>
          </form>

          {/* Separator */}
          <div className="relative flex items-center justify-center my-6 animate-fade-in-up">
            <div className="w-full border-t border-[#24242c]" />
            <span className="absolute bg-[#0d0d0d] px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              or continue with
            </span>
          </div>

          {/* Google OAuth Button */}
          <div className="animate-fade-in-up">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs border border-slate-200 flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.98] transition-all duration-200 disabled:opacity-50 cursor-pointer"
            >
              <GoogleIcon />
              <span>{googleLoading ? "Connecting to Google..." : "Continue with Google"}</span>
            </button>
          </div>

          {/* Functional Create Account Toggle Footer */}
          <div className="text-center mt-6 text-xs text-slate-500 animate-fade-in-up">
            {authMode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-[#ff334b] font-medium hover:underline cursor-pointer"
                >
                  Log in.
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-[#ff334b] font-medium hover:underline cursor-pointer"
                >
                  Create an account.
                </button>
              </>
            )}
          </div>

        </div>

        {/* Bottom Feature Badges Grid */}
        <div className="w-full max-w-md grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 border-t border-[#24242c]/60 mt-auto">
          <div className="bg-[#111116] border border-[#24242c] rounded-xl p-2.5 flex items-center gap-2.5 hover:border-[#ff334b]/30 transition-colors">
            <div className="text-base text-[#ff334b]">🛡️</div>
            <div>
              <h5 className="text-[10px] font-bold text-white leading-tight">Secure & Private</h5>
              <p className="text-[8px] text-slate-400 mt-0.5">Encrypted data</p>
            </div>
          </div>

          <div className="bg-[#111116] border border-[#24242c] rounded-xl p-2.5 flex items-center gap-2.5 hover:border-[#ff334b]/30 transition-colors">
            <div className="text-base text-[#ff334b]">⚡</div>
            <div>
              <h5 className="text-[10px] font-bold text-white leading-tight">Fast & Reliable</h5>
              <p className="text-[8px] text-slate-400 mt-0.5">All devices</p>
            </div>
          </div>

          <div className="bg-[#111116] border border-[#24242c] rounded-xl p-2.5 flex items-center gap-2.5 hover:border-[#ff334b]/30 transition-colors">
            <div className="text-base text-[#ff334b]">👥</div>
            <div>
              <h5 className="text-[10px] font-bold text-white leading-tight">Coach Connected</h5>
              <p className="text-[8px] text-slate-400 mt-0.5">Always linked</p>
            </div>
          </div>

          <div className="bg-[#111116] border border-[#24242c] rounded-xl p-2.5 flex items-center gap-2.5 hover:border-[#ff334b]/30 transition-colors">
            <div className="text-base text-[#ff334b]">🏆</div>
            <div>
              <h5 className="text-[10px] font-bold text-white leading-tight">Results Driven</h5>
              <p className="text-[8px] text-slate-400 mt-0.5">Reach targets</p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { createBrowserClient } from "@supabase/ssr";

export default function UpdatePasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const getSupabaseBrowser = () => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      setLoading(false);
      return;
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const supabaseBrowser = getSupabaseBrowser();
      const { error } = await supabaseBrowser.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setSuccessMessage("Your password has been updated successfully! Redirecting...");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (err: unknown) {
      console.error("Update password error:", err);
      const msg = err instanceof Error ? err.message : "Failed to update password. Please try again.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d0d0d] text-white p-4 font-sans select-none">
      
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#ff334b]/5 via-transparent to-[#0d0d0d] pointer-events-none" />

      <div className="w-full max-w-md bg-[#121216] border border-[#24242c] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 relative z-10 animate-fade-in-up">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff334b] to-[#c62828] p-[2px] flex items-center justify-center shadow-lg shadow-[#ff334b]/30">
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
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight text-center pt-2">
            Set New Password
          </h1>
          <p className="text-xs text-slate-400 text-center">
            Enter your new password below to update your account credentials.
          </p>
        </div>

        {/* Error / Success Notifications */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl text-xs font-medium bg-red-950/40 border border-red-800/60 text-[#ff334b] flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl text-xs font-medium bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Update Password Form */}
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          
          {/* New Password Field */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              New Password
            </label>
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
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter at least 6 characters"
                className="w-full bg-[#18181e] border border-[#24242c] rounded-xl pl-11 pr-11 py-3 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-[#ff334b] transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 text-slate-500 hover:text-slate-300 focus:outline-none"
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

          {/* Confirm Password Field */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Confirm New Password
            </label>
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
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className="w-full bg-[#18181e] border border-[#24242c] rounded-xl pl-11 pr-4 py-3 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-[#ff334b] transition-all duration-200"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#ff334b] to-[#c62828] text-white font-bold text-sm tracking-wide shadow-lg shadow-[#ff334b]/20 hover:shadow-[0_0_25px_rgba(255,51,75,0.5)] hover:scale-[1.015] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 pt-3"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Updating Password...</span>
              </>
            ) : (
              <span>Update Password</span>
            )}
          </button>

        </form>

      </div>
    </div>
  );
}

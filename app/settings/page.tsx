"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import WeightTracker from "@/components/WeightTracker";
import { resolveActiveUserId, hashPassword } from "@/lib/userHelper";

export default function SettingsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ username: string; email: string; role: string }>({
    username: "",
    email: "",
    role: "client",
  });

  // Calculation mode state: "manual" vs "auto"
  const [calcMode, setCalcMode] = useState<"manual" | "auto">("auto");

  // Body & Goal Weight Trajectory States
  const [bodyWeightKg, setBodyWeightKg] = useState<number>(78.4);
  const [goalWeightKg, setGoalWeightKg] = useState<number>(72.0);
  const [activityLevel, setActivityLevel] = useState<"sedentary" | "moderate" | "active" | "very_active">("active");

  // Manual input states
  const [manualProtein, setManualProtein] = useState<number>(180);
  const [manualCarbs, setManualCarbs] = useState<number>(150);
  const [manualFats, setManualFats] = useState<number>(60);

  // Account Security States
  const [newPassword, setNewPassword] = useState<string>("");
  const [passwordSaving, setPasswordSaving] = useState<boolean>(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic Goal Weight Trajectory Calculation Engine
  const calculateGoalTrajectory = (currentW: number, goalW: number, activity: string) => {
    const w = Number(currentW) || 75;
    const gW = Number(goalW) || w;
    const delta = gW - w; // e.g. -6.4kg for cutting

    // Activity multiplier baseline (kcal/kg)
    let activityKcalPerKg = 34; // default active
    if (activity === "sedentary") activityKcalPerKg = 26;
    if (activity === "moderate") activityKcalPerKg = 30;
    if (activity === "active") activityKcalPerKg = 34;
    if (activity === "very_active") activityKcalPerKg = 38;

    const tdee = w * activityKcalPerKg;

    let phaseName = "Recomposition / Maintenance Phase";
    let trajectoryFactor = 1.0;
    let proteinRatio = 2.0; // g per kg

    if (delta < -1.5) {
      // Cutting / Fat Loss Trajectory
      phaseName = `Cutting Phase (Fat Loss Target: ${delta.toFixed(1)} kg)`;
      // Deficit scales with target magnitude (between -12% and -22%)
      const deficitPct = Math.min(0.22, Math.max(0.12, Math.abs(delta) * 0.02));
      trajectoryFactor = 1.0 - deficitPct;
      proteinRatio = 2.2; // High protein to preserve muscle in deficit
    } else if (delta > 1.5) {
      // Lean Bulking / Hypertrophy Trajectory
      phaseName = `Lean Bulking Phase (Gain Target: +${delta.toFixed(1)} kg)`;
      const surplusPct = Math.min(0.15, Math.max(0.08, delta * 0.015));
      trajectoryFactor = 1.0 + surplusPct;
      proteinRatio = 2.0;
    }

    const targetCal = Math.round(tdee * trajectoryFactor);
    const protein = Math.round(w * proteinRatio);
    const fats = Math.round(w * 0.9);
    const proteinKcal = protein * 4;
    const fatsKcal = fats * 9;
    const remainingKcal = Math.max(0, targetCal - proteinKcal - fatsKcal);
    const carbs = Math.round(remainingKcal / 4);

    return {
      delta,
      phaseName,
      calories: targetCal,
      protein,
      carbs,
      fats,
    };
  };

  const trajectory = calculateGoalTrajectory(bodyWeightKg, goalWeightKg, activityLevel);

  const activeProtein = calcMode === "auto" ? trajectory.protein : manualProtein;
  const activeCarbs = calcMode === "auto" ? trajectory.carbs : manualCarbs;
  const activeFats = calcMode === "auto" ? trajectory.fats : manualFats;
  const activeCalories = calcMode === "auto"
    ? trajectory.calories
    : Math.round((Number(manualProtein) || 0) * 4 + (Number(manualCarbs) || 0) * 4 + (Number(manualFats) || 0) * 9);

  // Load Settings & User Profile
  useEffect(() => {
    async function loadSettingsAndProfile() {
      setLoading(true);
      try {
        const uid = await resolveActiveUserId();
        setActiveUserId(uid);

        // 1. Check local storage for user profile & saved settings
        if (typeof window !== "undefined") {
          const localUser = localStorage.getItem("ryvom_user");
          if (localUser) {
            try {
              const p = JSON.parse(localUser);
              setUserInfo({
                username: p.username || "Athlete",
                email: p.email || `${p.username || "athlete"}@ryvom.local`,
                role: p.role || "client",
              });
            } catch (e) {}
          }

          const savedSet = localStorage.getItem("ryvom_user_settings");
          if (savedSet) {
            try {
              const s = JSON.parse(savedSet);
              if (s.current_weight) setBodyWeightKg(Number(s.current_weight));
              if (s.goal_weight) setGoalWeightKg(Number(s.goal_weight));
              if (s.activity_level) setActivityLevel(s.activity_level);
              if (s.calc_mode) setCalcMode(s.calc_mode);
              if (s.manual_protein) setManualProtein(Number(s.manual_protein));
              if (s.manual_carbs) setManualCarbs(Number(s.manual_carbs));
              if (s.manual_fats) setManualFats(Number(s.manual_fats));
            } catch (e) {}
          }
        }

        // 2. Fetch latest saved settings from Supabase user_settings table for active user
        let query = supabase.from("user_settings").select("user_id, target_calories, target_protein, target_carbs, target_fats, goal_weight");
        if (uid) query = query.eq("user_id", uid);
        const { data, error } = await query.limit(1).maybeSingle();
        if (error) console.error("Error loading user settings:", error);

        if (data) {
          setRowId(data.user_id || null);
          setManualProtein(Number(data.target_protein) || 180);
          setManualCarbs(Number(data.target_carbs) || 150);
          setManualFats(Number(data.target_fats) || 60);
          if (data.goal_weight) setGoalWeightKg(Number(data.goal_weight));
        }

        // 3. Fetch latest logged weight from progress/weight_logs so bodyWeightKg defaults to actual latest weight
        const { data: latestWeightData } = await supabase
          .from("progress")
          .select("weight")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestWeightData?.weight) {
          setBodyWeightKg(Number(latestWeightData.weight));
        }
      } catch (err: any) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettingsAndProfile();
  }, []);

  // Save Settings to Supabase with Persistence Fix
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const uid = activeUserId || (await resolveActiveUserId());
    setActiveUserId(uid);

    // Save valid columns to Supabase user_settings
    const payload: any = {
      user_id: uid || null,
      target_calories: activeCalories,
      target_protein: activeProtein,
      target_carbs: activeCarbs,
      target_fats: activeFats,
      goal_weight: goalWeightKg,
    };

    try {
      const targetUserId = uid || rowId;
      if (targetUserId) {
        const { error: upsertErr } = await supabase
          .from("user_settings")
          .upsert([payload], { onConflict: "user_id" })
          .select("user_id")
          .maybeSingle();

        if (upsertErr) {
          console.error("Upsert error in settings:", upsertErr);
          if (rowId) {
            const { error: updateErr } = await supabase
              .from("user_settings")
              .update(payload)
              .eq("user_id", rowId);
            if (updateErr) throw updateErr;
          } else {
            const { data: newData, error: insertErr } = await supabase
              .from("user_settings")
              .insert([payload])
              .select("user_id")
              .single();
            if (insertErr) throw insertErr;
            if (newData?.user_id) setRowId(newData.user_id);
          }
        } else {
          setRowId(targetUserId);
        }
      }

      // Persist complete user settings snapshot to localStorage so state never resets
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "ryvom_user_settings",
          JSON.stringify({
            current_weight: bodyWeightKg,
            goal_weight: goalWeightKg,
            activity_level: activityLevel,
            calc_mode: calcMode,
            target_calories: activeCalories,
            target_protein: activeProtein,
            target_carbs: activeCarbs,
            target_fats: activeFats,
            manual_protein: manualProtein,
            manual_carbs: manualCarbs,
            manual_fats: manualFats,
          })
        );
      }

      // Refresh router so server cache / app router state updates instantly
      router.refresh();

      setSuccessMessage(`✓ Dynamic target settings (${activeCalories} kcal) saved to profile!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Save Error:", err);
      setErrorMessage(err.message || "Failed to save settings to profile.");
    } finally {
      setSaving(false);
    }
  };

  // Account Password Update Handler
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    setPasswordSaving(true);
    setPasswordSuccess(null);
    setPasswordError(null);

    try {
      // 1. Try Supabase Auth password update
      const { error: authErr } = await supabase.auth.updateUser({ password: newPassword });

      // 2. Also update custom public.users table if activeUserId is bound
      if (activeUserId) {
        const hashed = await hashPassword(newPassword);
        await supabase.from("users").update({ password_hash: hashed }).eq("id", activeUserId);
      }

      setPasswordSuccess("✓ Account password updated successfully!");
      setNewPassword("");
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err: any) {
      console.error("Password update error:", err);
      setPasswordError(err.message || "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
      } else {
        setAuthChecked(true);
      }
    });
  }, [router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0b0b0e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#ff334b]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-zinc-100 flex flex-col antialiased">
      {/* Navigation Header */}
      <header className="border-b border-zinc-800/80 bg-[#0e0e12]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff334b] to-[#ff5b6e] flex items-center justify-center font-black text-white shadow-lg shadow-[#ff334b]/20 group-hover:scale-105 transition">
                R
              </div>
              <span className="font-extrabold text-lg text-white tracking-wide uppercase">Ryvom</span>
            </Link>
          </div>

          <Link
            href="/"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700/50 flex items-center gap-1.5 active:scale-95"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Card 1: Macro Target Settings & Goal Trajectory Engine */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
            <div className="w-10 h-10 rounded-xl bg-[#ff334b]/10 border border-[#ff334b]/20 flex items-center justify-center text-xl">
              🎯
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Goal Weight & Macro Engine
              </h1>
              <p className="text-xs text-zinc-400">
                Dynamic calorie & muscle-preserving macro calculations bound to your profile
              </p>
            </div>
          </div>

          {/* Mode Selector Toggle */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0b0b0e] border border-zinc-800">
            <button
              type="button"
              onClick={() => setCalcMode("auto")}
              className={`py-2.5 rounded-lg text-xs font-bold transition ${
                calcMode === "auto"
                  ? "bg-[#ff334b] text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              ⚡ Auto-Calculate by Goal Trajectory
            </button>
            <button
              type="button"
              onClick={() => setCalcMode("manual")}
              className={`py-2.5 rounded-lg text-xs font-bold transition ${
                calcMode === "manual"
                  ? "bg-[#ff334b] text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              ✍️ Manual Entry
            </button>
          </div>

          {successMessage && (
            <div className="p-4 rounded-xl text-xs font-bold border bg-emerald-950/30 border-emerald-700/60 text-emerald-400 shadow-lg animate-fade-in flex items-center justify-between">
              <span>{successMessage}</span>
              <Link href="/" className="underline text-emerald-300 hover:text-white">
                View Dashboard
              </Link>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 rounded-xl text-xs font-medium border bg-red-950/20 border-red-900/50 text-[#ff334b]">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="space-y-4 animate-pulse py-4">
              <div className="h-10 bg-zinc-800/60 rounded-xl w-full"></div>
              <div className="h-10 bg-zinc-800/60 rounded-xl w-full"></div>
              <div className="h-10 bg-zinc-800/60 rounded-xl w-full"></div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {/* Auto-Calculation Specific Inputs */}
              {calcMode === "auto" && (
                <div className="p-5 rounded-xl bg-[#0b0b0e]/80 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Goal Trajectory Profile
                    </h3>
                    <span className="text-xs font-bold text-[#ff334b]">
                      {trajectory.phaseName}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Current Weight (kg)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="30"
                        max="300"
                        value={bodyWeightKg}
                        onChange={(e) => setBodyWeightKg(Number(e.target.value))}
                        className="w-full bg-[#121216] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Goal Weight (kg)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="30"
                        max="300"
                        value={goalWeightKg}
                        onChange={(e) => setGoalWeightKg(Number(e.target.value))}
                        className="w-full bg-[#121216] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Activity Level
                      </label>
                      <select
                        value={activityLevel}
                        onChange={(e: any) => setActivityLevel(e.target.value)}
                        className="w-full bg-[#121216] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#ff334b] transition"
                      >
                        <option value="sedentary">Sedentary (Office Job)</option>
                        <option value="moderate">Moderate (1-3 workouts/wk)</option>
                        <option value="active">Active (Lifting 4-5 days/wk)</option>
                        <option value="very_active">Very Active (Heavy training)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Target Calories Display */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>🔥</span> Target Calories
                  </span>
                  <span className="text-[10px] text-zinc-500 font-normal">
                    {calcMode === "auto" ? "TDEE × Trajectory Factor" : "(Protein × 4 + Carbs × 4 + Fats × 9)"}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    readOnly
                    value={activeCalories}
                    className="w-full bg-[#16161c] border border-zinc-800/80 rounded-xl px-4 py-3 text-sm text-zinc-200 font-bold cursor-not-allowed focus:outline-none shadow-inner"
                  />
                  <span className="absolute right-4 top-3 text-xs font-semibold text-rose-500">
                    kcal
                  </span>
                </div>
              </div>

              {/* Macro Displays / Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>🥩</span> Protein (g)
                  </label>
                  <input
                    type="number"
                    required
                    readOnly={calcMode === "auto"}
                    min="0"
                    max="1000"
                    value={activeProtein}
                    onChange={(e) => setManualProtein(Number(e.target.value))}
                    className={`w-full border rounded-xl px-4 py-3 text-sm transition ${
                      calcMode === "auto"
                        ? "bg-[#16161c] border-zinc-800/80 text-emerald-400 font-bold cursor-not-allowed"
                        : "bg-[#0b0b0e] border-zinc-800 text-white focus:outline-none focus:border-emerald-500"
                    }`}
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    = {activeProtein * 4} kcal
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>🍚</span> Carbs (g)
                  </label>
                  <input
                    type="number"
                    required
                    readOnly={calcMode === "auto"}
                    min="0"
                    max="1000"
                    value={activeCarbs}
                    onChange={(e) => setManualCarbs(Number(e.target.value))}
                    className={`w-full border rounded-xl px-4 py-3 text-sm transition ${
                      calcMode === "auto"
                        ? "bg-[#16161c] border-zinc-800/80 text-cyan-400 font-bold cursor-not-allowed"
                        : "bg-[#0b0b0e] border-zinc-800 text-white focus:outline-none focus:border-cyan-500"
                    }`}
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    = {activeCarbs * 4} kcal
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>🥑</span> Fats (g)
                  </label>
                  <input
                    type="number"
                    required
                    readOnly={calcMode === "auto"}
                    min="0"
                    max="1000"
                    value={activeFats}
                    onChange={(e) => setManualFats(Number(e.target.value))}
                    className={`w-full border rounded-xl px-4 py-3 text-sm transition ${
                      calcMode === "auto"
                        ? "bg-[#16161c] border-zinc-800/80 text-amber-400 font-bold cursor-not-allowed"
                        : "bg-[#0b0b0e] border-zinc-800 text-white focus:outline-none focus:border-amber-400"
                    }`}
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    = {activeFats * 9} kcal
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-4 bg-gradient-to-r from-[#ff334b] to-[#e02d41] hover:from-[#e02d41] hover:to-[#c82235] disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-[#ff334b]/20 active:scale-[0.98] text-sm flex items-center justify-center gap-2"
                >
                  {saving ? "Saving Settings..." : `Save Target Settings (${activeCalories} kcal)`}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Card 2: Weight Tracker & Historical Chart Section */}
        <WeightTracker user={userInfo} goalWeight={goalWeightKg} onWeightUpdated={(w) => setBodyWeightKg(w)} />

        {/* Card 3: User Profile & Account Management */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl">
              👤
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                User Profile & Account Security
              </h2>
              <p className="text-xs text-zinc-400">
                Manage user profile details and password security options
              </p>
            </div>
          </div>

          {passwordSuccess && (
            <div className="p-4 rounded-xl text-xs font-bold border bg-emerald-950/30 border-emerald-700/60 text-emerald-400 shadow-lg animate-fade-in">
              {passwordSuccess}
            </div>
          )}

          {passwordError && (
            <div className="p-4 rounded-xl text-xs font-medium border bg-red-950/20 border-red-900/50 text-[#ff334b]">
              {passwordError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Username / Display Name
              </label>
              <input
                type="text"
                readOnly
                value={userInfo.username || "Athlete"}
                className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-medium cursor-not-allowed opacity-80"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                readOnly
                value={userInfo.email || "athlete@ryvom.local"}
                className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-medium cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          <form onSubmit={handleUpdatePassword} className="pt-2 space-y-3 border-t border-zinc-800/80">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Change Account Password
            </label>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="password"
                placeholder="Enter new password (min. 6 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
              />
              <button
                type="submit"
                disabled={passwordSaving}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-md active:scale-95 whitespace-nowrap"
              >
                {passwordSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-[#07070a] py-6 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} Ryvom App. All rights reserved.
      </footer>
    </div>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveActiveUserId } from "@/lib/userHelper";

export type LiftType = "Squat" | "Bench Press" | "Deadlift";

// Human maximum weight limits in kg per lift
export const LIFT_MAX_LIMITS: Record<LiftType, number> = {
  Deadlift: 500,
  "Bench Press": 450,
  Squat: 600,
};

// Roast array for sarcastic validation errors when weight exceeds human limits
const sarcasticErrors = [
  "Did you accidentally park a Honda Civic on the bar?",
  "Eddie Hall called, he wants his world record back.",
  "Ego lifting in a database? That's a new low.",
  "Are you lifting on Jupiter? Check your math.",
  "Bro thinks he's an Avenger. Lower the weight.",
  "NASA is looking for someone to manually launch the next shuttle. You in?",
  "I didn't realize we had a literal forklift using this app.",
  "Your keyboard must be broken, because nobody is lifting that.",
];

interface ManualLiftLoggerProps {
  user?: { id?: string; email?: string; username?: string; role?: string } | null;
  onLiftLogged?: (entry: Record<string, unknown>) => void;
}

export default function ManualLiftLogger({ user, onLiftLogged }: ManualLiftLoggerProps) {
  const [liftType, setLiftType] = useState<LiftType>("Squat");
  const [weightKg, setWeightKg] = useState<string>("");
  const [reps, setReps] = useState<number>(1);
  const [logDate] = useState<string>(new Date().toISOString().split("T")[0]);

  const [saving, setSaving] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Validation checks
  const weightNum = parseFloat(weightKg);
  const maxLimit = LIFT_MAX_LIMITS[liftType];
  const isWeightExceeded = !isNaN(weightNum) && weightNum > maxLimit;
  const isSubmitDisabled = saving || isWeightExceeded || !!errorMessage || !weightKg || isNaN(weightNum) || weightNum <= 0;

  // Handle Weight Input Change & Trigger Random Sarcastic Error
  const handleWeightChange = (val: string, currentLift: LiftType = liftType) => {
    setWeightKg(val);
    const w = parseFloat(val);
    const max = LIFT_MAX_LIMITS[currentLift];

    if (!isNaN(w) && w > max) {
      const randomIndex = Math.floor(Math.random() * sarcasticErrors.length);
      setErrorMessage(sarcasticErrors[randomIndex]);
    } else {
      setErrorMessage("");
    }
  };

  // Handle Lift Type Dropdown Change
  const handleLiftTypeChange = (newLift: LiftType) => {
    setLiftType(newLift);
    handleWeightChange(weightKg, newLift);
  };

  const handleLogLift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWeightExceeded || isSubmitDisabled) return;

    setSaving(true);
    setFeedbackMessage(null);

    try {
      const targetUserId = await resolveActiveUserId(user);

      const newEntry = {
        id: crypto.randomUUID(),
        user_id: targetUserId || null,
        lift_type: liftType,
        weight_kg: weightNum,
        sets: 1,
        reps: Number(reps) || 1,
        logged_date: new Date(logDate).toISOString(),
      };

      const { error: insertErr } = await supabase.from("lift_logs").insert([newEntry]);
      if (insertErr) throw insertErr;

      // Clear form & error on success
      setWeightKg("");
      setReps(1);
      setErrorMessage("");

      // Display success toast message
      setFeedbackMessage(`✓ Logged ${liftType}: ${weightNum} kg × ${reps} rep(s)!`);

      if (onLiftLogged) {
        onLiftLogged(newEntry);
      }

      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: unknown) {
      console.error("Save lift error:", err);
      const msg = err instanceof Error ? err.message : "Failed to log lift entry.";
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-lg">
            🏋️‍♂️
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Manual Lift Logger
            </h3>
            <p className="text-[11px] text-zinc-400">
              Log compound PRs to update your public portfolio & strength records
            </p>
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {feedbackMessage && (
        <div className="p-3.5 rounded-xl text-xs font-bold border bg-emerald-950/40 border-emerald-600/60 text-emerald-300 shadow-md animate-fade-in flex items-center gap-2">
          <span>✨</span>
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Logger Form */}
      <form onSubmit={handleLogLift} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
          {/* Lift Type Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Select Lift
            </label>
            <select
              value={liftType}
              onChange={(e) => handleLiftTypeChange(e.target.value as LiftType)}
              className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-[#ff334b] transition"
            >
              <option value="Squat">🍗 Squat (Max: 600kg)</option>
              <option value="Bench Press">💪 Bench Press (Max: 450kg)</option>
              <option value="Deadlift">💀 Deadlift (Max: 500kg)</option>
            </select>
          </div>

          {/* Weight Input with Bold Red Sarcastic Error */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Weight (kg)
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              required
              placeholder="e.g. 140"
              value={weightKg}
              onChange={(e) => handleWeightChange(e.target.value)}
              className={`w-full bg-[#0b0b0e] border rounded-xl px-4 py-2.5 text-sm font-bold transition focus:outline-none ${
                errorMessage
                  ? "border-rose-500 text-rose-400 focus:border-rose-500 shadow-rose-950/20"
                  : "border-zinc-800 text-white focus:border-[#ff334b]"
              }`}
            />
            {errorMessage && (
              <p className="text-xs font-bold text-rose-500 mt-1.5 animate-pulse leading-snug">
                ⚠️ {errorMessage}
              </p>
            )}
          </div>

          {/* Reps Input (default 1) */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Reps
            </label>
            <input
              type="number"
              min="1"
              max="100"
              required
              value={reps}
              onChange={(e) => setReps(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-[#ff334b] transition"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="w-full py-3.5 bg-gradient-to-r from-[#ff334b] to-[#ff5b6e] hover:from-[#e02d41] hover:to-[#e04558] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition shadow-lg shadow-[#ff334b]/20 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {saving ? (
            <span>Logging Lift...</span>
          ) : (
            <span>Log Lift</span>
          )}
        </button>
      </form>
    </div>
  );
}

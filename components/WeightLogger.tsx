"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveActiveUserId } from "@/lib/userHelper";

interface WeightLoggerProps {
  user?: { id?: string; email?: string; username?: string; role?: string } | null;
  onWeightLogged?: (newWeight: number) => void;
}

export default function WeightLogger({ user, onWeightLogged }: WeightLoggerProps) {
  const [weightKg, setWeightKg] = useState<string>("");
  const [logDate, setLogDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(weightKg);

    if (!val || val <= 0) {
      setError("Please enter a valid weight in kg (e.g. 78.4).");
      return;
    }

    setSaving(true);
    setFeedback(null);
    setError(null);

    try {
      const targetUserId = await resolveActiveUserId(user);

      const newEntry = {
        id: crypto.randomUUID(),
        user_id: targetUserId || null,
        weight_kg: val,
        logged_date: new Date(logDate).toISOString(),
      };

      // 1. Insert into public.weight_logs table
      const { error: insertErr } = await supabase.from("weight_logs").insert([newEntry]);

      // 2. Fallback to public.progress table if weight_logs table fails
      if (insertErr) {
        console.warn("weight_logs insert failed, fallback to progress table:", insertErr.message);
        const { error: progErr } = await supabase.from("progress").insert([
          {
            id: crypto.randomUUID(),
            user_id: targetUserId || null,
            weight: val,
            date: logDate,
          },
        ]);
        if (progErr) console.error("progress table fallback failed:", progErr);
      }

      setFeedback(`✓ Successfully logged ${val} kg for ${logDate}!`);
      setWeightKg("");

      if (onWeightLogged) {
        onWeightLogged(val);
      }

      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      console.error("Save weight error:", err);
      const msg = err instanceof Error ? err.message : "Failed to save weight entry.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>⚖️</span> Quick Weight Logger
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Log current body weight to update your daily trend & progress charts
          </p>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl text-xs font-bold border bg-emerald-950/30 border-emerald-700/60 text-emerald-400 shadow-md animate-fade-in">
          {feedback}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl text-xs font-medium border bg-red-950/20 border-red-900/50 text-[#ff334b]">
          {error}
        </div>
      )}

      <form onSubmit={handleLogWeight} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
            Weight (kg)
          </label>
          <input
            type="number"
            step="0.1"
            min="30"
            max="300"
            required
            placeholder="e.g. 78.4"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition font-bold"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
            Date
          </label>
          <input
            type="date"
            required
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition font-medium"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-gradient-to-r from-[#ff334b] to-[#ff5b6e] hover:from-[#e02d41] hover:to-[#e04558] disabled:opacity-50 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-[#ff334b]/20 active:scale-[0.98]"
        >
          {saving ? "Saving..." : "+ Log Weight"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toPng } from "html-to-image";
import { supabase } from "@/lib/supabase";
import { getOrCreatePublicUser, resolveActiveUserId } from "@/lib/userHelper";

export type TimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

export interface WeightLogEntry {
  id: string;
  weight_kg: number;
  logged_date: string;
}

interface WeightTrackerProps {
  user?: any;
  goalWeight?: number;
  onWeightUpdated?: (newWeight: number) => void;
  readOnly?: boolean;
}

export default function WeightTracker({ user, goalWeight = 72.0, onWeightUpdated, readOnly = false }: WeightTrackerProps) {
  const [logs, setLogs] = useState<WeightLogEntry[]>([]);
  const [newWeight, setNewWeight] = useState<string>("");
  const [logDate, setLogDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [timeRange, setTimeRange] = useState<TimeRange>("3M");

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);

  // Export Chart to Image Handler using html-to-image
  const handleExportChart = async () => {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(chartRef.current, {
        cacheBust: true,
        backgroundColor: "#0b0b0e",
        filter: (node) => {
          if (node.classList && node.classList.contains("no-export")) {
            return false;
          }
          return true;
        },
      });
      const link = document.createElement("a");
      link.download = `ryvom-progress-export.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export chart error:", err);
    } finally {
      setExporting(false);
    }
  };

  // Fetch weight logs from Supabase with user_id binding
  const fetchWeightLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const targetUserId = await resolveActiveUserId(user);

      // 1. Query weight_logs table filtered explicitly by user_id
      let query = supabase
        .from("weight_logs")
        .select("id, weight_kg, logged_date");

      if (targetUserId) {
        query = query.eq("user_id", targetUserId);
      }

      let { data, error: dbErr } = await query.order("logged_date", { ascending: true });

      // 2. Fallback to progress table if weight_logs is empty or missing
      if (dbErr || !data || data.length === 0) {
        let progQuery = supabase.from("progress").select("id, weight, date");
        if (targetUserId) progQuery = progQuery.eq("user_id", targetUserId);
        
        const { data: progData } = await progQuery.order("date", { ascending: true });

        if (progData && progData.length > 0) {
          data = progData.map((p) => ({
            id: p.id,
            weight_kg: Number(p.weight) || 0,
            logged_date: p.date,
          }));
        }
      }

      if (data && data.length > 0) {
        const formatted = data.map((d: any) => ({
          id: d.id,
          weight_kg: Number(d.weight_kg || d.weight || 0),
          logged_date: d.logged_date || d.date || new Date().toISOString(),
        }));
        setLogs(formatted);
      } else {
        // Sample default data if database has zero logs
        setLogs([
          { id: "sample-1", weight_kg: 82.5, logged_date: new Date(Date.now() - 60 * 86400000).toISOString() },
          { id: "sample-2", weight_kg: 81.2, logged_date: new Date(Date.now() - 45 * 86400000).toISOString() },
          { id: "sample-3", weight_kg: 79.8, logged_date: new Date(Date.now() - 30 * 86400000).toISOString() },
          { id: "sample-4", weight_kg: 79.0, logged_date: new Date(Date.now() - 15 * 86400000).toISOString() },
          { id: "sample-5", weight_kg: 78.4, logged_date: new Date().toISOString() },
        ]);
      }
    } catch (err: any) {
      console.error("Weight logs fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWeightLogs();
  }, [fetchWeightLogs]);

  // Handle logging a new weight entry with user_id binding
  const handleLogWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newWeight);
    if (!val || val <= 0) {
      setError("Please enter a valid weight in kg.");
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

      // Try inserting into weight_logs with explicit user_id
      let { error: insertErr } = await supabase.from("weight_logs").insert([newEntry]);

      // Fallback insert to progress table if weight_logs table fails
      if (insertErr) {
        console.warn("weight_logs insert failed, attempting progress table insert fallback:", insertErr);
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

      // Update local state instantly so chart re-renders without full page reload
      const updatedLog: WeightLogEntry = {
        id: newEntry.id,
        weight_kg: val,
        logged_date: newEntry.logged_date,
      };

      setLogs((prev) => [...prev, updatedLog].sort((a, b) => new Date(a.logged_date).getTime() - new Date(b.logged_date).getTime()));
      setFeedback(`✓ Logged ${val} kg for ${logDate}!`);
      setNewWeight("");

      if (onWeightUpdated) onWeightUpdated(val);

      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      console.error("Save weight error:", err);
      setError(err.message || "Failed to log weight.");
    } finally {
      setSaving(false);
    }
  };

  // Filter logs by selected time range
  const filteredLogs = useMemo(() => {
    if (logs.length === 0) return [];
    const now = new Date().getTime();

    let daysLimit = 0;
    if (timeRange === "1M") daysLimit = 30;
    if (timeRange === "3M") daysLimit = 90;
    if (timeRange === "6M") daysLimit = 180;
    if (timeRange === "1Y") daysLimit = 365;

    if (daysLimit === 0) return logs; // ALL

    const cutoff = now - daysLimit * 86400000;
    const res = logs.filter((l) => new Date(l.logged_date).getTime() >= cutoff);
    return res.length > 0 ? res : logs;
  }, [logs, timeRange]);

  // Key Statistics
  const initialWeight = logs.length > 0 ? logs[0].weight_kg : 0;
  const currentWeight = logs.length > 0 ? logs[logs.length - 1].weight_kg : 0;
  const totalChange = Math.round((currentWeight - initialWeight) * 10) / 10;

  // Chart min/max and Goal Weight reference line calculations
  const chartData = useMemo(() => {
    if (filteredLogs.length === 0) return { min: 60, max: 100, points: [], goalYPercent: null };
    const weights = filteredLogs.map((l) => l.weight_kg);

    const allVals = typeof goalWeight === "number" && goalWeight > 0 ? [...weights, goalWeight] : weights;
    const minW = Math.floor(Math.min(...allVals) - 1.5);
    const maxW = Math.ceil(Math.max(...allVals) + 1.5);
    const range = maxW - minW || 1;

    let goalYPercent: number | null = null;
    if (typeof goalWeight === "number" && goalWeight > 0) {
      goalYPercent = 100 - ((goalWeight - minW) / range) * 100;
    }

    const points = filteredLogs.map((l, index) => {
      const xPercent = (index / Math.max(1, filteredLogs.length - 1)) * 100;
      const yPercent = 100 - ((l.weight_kg - minW) / range) * 100;
      return {
        ...l,
        xPercent,
        yPercent,
        formattedDate: new Date(l.logged_date).toLocaleDateString([], { month: "short", day: "numeric" }),
      };
    });

    return { min: minW, max: maxW, points, goalYPercent };
  }, [filteredLogs, goalWeight]);

  // Generate SVG path string
  const svgPath = useMemo(() => {
    if (chartData.points.length === 0) return "";
    return chartData.points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.xPercent * 3} ${p.yPercent * 1.5}`)
      .join(" ");
  }, [chartData]);

  const svgAreaPath = useMemo(() => {
    if (chartData.points.length === 0) return "";
    const first = chartData.points[0];
    const last = chartData.points[chartData.points.length - 1];
    return `${svgPath} L ${last.xPercent * 3} 150 L ${first.xPercent * 3} 150 Z`;
  }, [svgPath, chartData]);

  return (
    <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <span>⚖️</span> Weight Tracker & Milestone Progress
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Log current body weight and track historical trends against target goals
          </p>
        </div>

        {/* Time Range Filter Buttons & Export Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-[#0b0b0e] p-1 rounded-xl border border-zinc-800">
            {(["1M", "3M", "6M", "1Y", "ALL"] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  timeRange === r
                    ? "bg-[#ff334b] text-white shadow-md"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportChart}
            disabled={exporting || loading}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 no-export"
            title="Export chart as PNG for social sharing"
          >
            <span>📸</span>
            <span>{exporting ? "Exporting..." : "Export Image"}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Bar: Initial, Current, Goal Weight & Total Progress */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[#0b0b0e] border border-zinc-800/80">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            🏁 Initial Weight
          </div>
          <div className="text-lg font-black text-white mt-0.5">
            {initialWeight} <span className="text-xs font-normal text-zinc-400">kg</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0b0b0e] border border-zinc-800/80">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            📍 Current Weight
          </div>
          <div className="text-lg font-black text-rose-400 mt-0.5">
            {currentWeight} <span className="text-xs font-normal text-zinc-400">kg</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0b0b0e] border border-cyan-900/40 bg-cyan-950/10">
          <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
            🎯 Target Goal
          </div>
          <div className="text-lg font-black text-cyan-300 mt-0.5">
            {goalWeight} <span className="text-xs font-normal text-cyan-500">kg</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0b0b0e] border border-zinc-800/80">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            📊 Overall Change
          </div>
          <div className={`text-lg font-black mt-0.5 ${totalChange <= 0 ? "text-emerald-400" : "text-amber-400"}`}>
            {totalChange > 0 ? `+${totalChange}` : totalChange} <span className="text-xs font-normal text-zinc-400">kg</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl text-xs font-bold border bg-emerald-950/30 border-emerald-700/60 text-emerald-400 shadow-lg animate-fade-in">
          {feedback}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl text-xs font-medium border bg-red-950/20 border-red-900/50 text-[#ff334b]">
          {error}
        </div>
      )}

      {/* Quick Weight Logging Form */}
      {!readOnly && (
        <form onSubmit={handleLogWeight} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Log Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              required
              placeholder="e.g. 78.4"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Date
            </label>
            <input
              type="date"
              required
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition"
            />
          </div>

          <button
            type="submit"
            disabled={saving || loading}
            className="w-full py-2.5 bg-[#ff334b] hover:bg-[#e02d41] disabled:opacity-50 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-[#ff334b]/20 active:scale-[0.98]"
          >
            {saving ? "Saving..." : "+ Log Weight"}
          </button>
        </form>
      )}

      {/* Historical Interactive SVG Chart */}
      <div className="pt-4 border-t border-zinc-800/60">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-3 font-semibold">
          <span className="flex items-center gap-2">
            <span>Weight Progress Trend ({timeRange})</span>
            {goalWeight && (
              <span className="text-[10px] text-cyan-400 font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                🎯 Target: {goalWeight} kg
              </span>
            )}
          </span>
          <span>
            Latest: <strong className="text-white">{currentWeight} kg</strong>
          </span>
        </div>

        {loading ? (
          <div className="h-48 bg-[#0b0b0e] rounded-xl animate-pulse flex items-center justify-center text-zinc-600 text-xs">
            Loading chart data...
          </div>
        ) : (
          <div ref={chartRef} className="relative bg-[#0b0b0e] border border-zinc-800/80 rounded-xl p-5 overflow-hidden space-y-3">
            {/* Branded Watermark Header for Image Export */}
            <div className="flex items-center justify-between text-xs border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#ff334b] text-white font-black text-[10px] flex items-center justify-center">R</span>
                <span className="font-extrabold text-white tracking-wider text-xs">RYVOM APP • WEIGHT PROGRESS TREND</span>
              </div>
              <span className="text-[10px] font-bold text-rose-400">
                Latest: {currentWeight} kg {goalWeight ? `(Target: ${goalWeight} kg)` : ""}
              </span>
            </div>

            {/* SVG Line, Goal Reference Line & Gradient Fill */}
            <svg viewBox="0 0 300 150" className="w-full h-44 overflow-visible preserve-3d">
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff334b" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ff334b" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="30" x2="300" y2="30" stroke="#1f1f26" strokeDasharray="3 3" />
              <line x1="0" y1="75" x2="300" y2="75" stroke="#1f1f26" strokeDasharray="3 3" />
              <line x1="0" y1="120" x2="300" y2="120" stroke="#1f1f26" strokeDasharray="3 3" />

              {/* Goal Weight Reference Line & Marker ("Bid Line") */}
              {chartData.goalYPercent !== null && (
                <g>
                  <line
                    x1="0"
                    y1={chartData.goalYPercent * 1.5}
                    x2="300"
                    y2={chartData.goalYPercent * 1.5}
                    stroke="#38bdf8"
                    strokeWidth="1.8"
                    strokeDasharray="4 4"
                  />
                  <text
                    x="295"
                    y={Math.max(12, chartData.goalYPercent * 1.5 - 4)}
                    textAnchor="end"
                    fill="#38bdf8"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    🎯 Target Goal: {goalWeight} kg
                  </text>
                </g>
              )}

              {/* Area Fill */}
              {svgAreaPath && <path d={svgAreaPath} fill="url(#weightGrad)" />}

              {/* Trend Line */}
              {svgPath && (
                <path
                  d={svgPath}
                  fill="none"
                  stroke="#ff334b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Points */}
              {chartData.points.map((p) => (
                <g key={p.id} className="group cursor-pointer">
                  <circle
                    cx={p.xPercent * 3}
                    cy={p.yPercent * 1.5}
                    r="4"
                    fill="#ff334b"
                    className="transition group-hover:r-6 group-hover:fill-white"
                  />
                </g>
              ))}
            </svg>

            {/* Labels overlay */}
            <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium">
              <span>{chartData.points[0]?.formattedDate || ""}</span>
              <span>{chartData.points[Math.floor(chartData.points.length / 2)]?.formattedDate || ""}</span>
              <span>{chartData.points[chartData.points.length - 1]?.formattedDate || ""}</span>
            </div>

            {/* Custom Social Watermark */}
            <div className="absolute bottom-2.5 right-4 text-[11px] font-black text-white/50 tracking-widest uppercase pointer-events-none select-none">
              @Ryvom
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

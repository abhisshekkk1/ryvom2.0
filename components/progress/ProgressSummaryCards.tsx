"use client";

import React from "react";
import { Scale, Trophy, Target, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatNum, formatDiff } from "@/lib/progressAnalytics";
import { PerformanceWithLogs } from "@/lib/types";

interface ProgressSummaryCardsProps {
  startingWeight: number | null;
  currentWeight: number | null;
  targetWeight: number | null;
  startingWaist: number | null;
  currentWaist: number | null;
  avgDiet: number | null;
  avgTraining: number | null;
  avgSteps: number | null;
  avgSleep: number | null;
  completedCheckins: number;
  missedCheckins: number;
  performanceMetrics?: PerformanceWithLogs[];
}

export default function ProgressSummaryCards({
  startingWeight,
  currentWeight,
  targetWeight,
  startingWaist,
  currentWaist,
  avgDiet,
  avgTraining,
  avgSteps,
  avgSleep,
  performanceMetrics = [],
}: ProgressSummaryCardsProps) {
  // Calculations
  const weightChange =
    currentWeight !== null && startingWeight !== null
      ? currentWeight - startingWeight
      : null;

  const remainingWeight =
    currentWeight !== null && targetWeight !== null
      ? currentWeight - targetWeight
      : null;

  const waistChange =
    currentWaist !== null && startingWaist !== null
      ? currentWaist - startingWaist
      : null;

  return (
    <div className="space-y-4">
      {/* ─── PRIMARY METRICS: WEIGHT & GOAL GRID ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. CURRENT WEIGHT */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 p-4 rounded-2xl transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Current Weight
            </span>
            <Scale className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {currentWeight !== null ? `${formatNum(currentWeight, 1)} kg` : "—"}
            </div>
            <div className="text-xs text-zinc-400 mt-1 truncate">
              {startingWeight !== null ? `Started at ${formatNum(startingWeight, 1)} kg` : "Latest check-in"}
            </div>
          </div>
        </div>

        {/* 2. TOTAL CHANGE */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 p-4 rounded-2xl transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Total Change
            </span>
            {weightChange !== null && weightChange < 0 ? (
              <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
            ) : weightChange !== null && weightChange > 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Minus className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </div>
          <div className="mt-2">
            <div
              className={`text-2xl sm:text-3xl font-bold tracking-tight ${
                weightChange !== null && weightChange < 0
                  ? "text-emerald-400"
                  : weightChange !== null && weightChange > 0
                  ? "text-amber-400"
                  : "text-zinc-200"
              }`}
            >
              {weightChange !== null ? formatDiff(weightChange, 1, "kg") : "—"}
            </div>
            <div className="text-xs text-zinc-400 mt-1 truncate">
              {startingWeight !== null ? "Since starting baseline" : "Awaiting baseline"}
            </div>
          </div>
        </div>

        {/* 3. TARGET WEIGHT */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 p-4 rounded-2xl transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Target Weight
            </span>
            <Target className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {targetWeight !== null ? `${formatNum(targetWeight, 1)} kg` : "—"}
            </div>
            <div className="text-xs text-zinc-400 mt-1 truncate">
              {targetWeight !== null ? "Coach target goal" : "No target set"}
            </div>
          </div>
        </div>

        {/* 4. REMAINING TO TARGET */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 p-4 rounded-2xl transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Remaining
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              Goal
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {remainingWeight !== null
                ? `${Math.abs(remainingWeight).toFixed(1)} kg`
                : "—"}
            </div>
            <div className="text-xs text-zinc-400 mt-1 truncate">
              {remainingWeight !== null
                ? remainingWeight > 0
                  ? "To lose to target"
                  : remainingWeight < 0
                  ? "To gain to target"
                  : "Target achieved!"
                : "Set target in profile"}
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECONDARY METRICS: WAIST & ADHERENCE ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Starting Waist */}
        <div className="bg-zinc-900/60 border border-zinc-800/70 p-3.5 rounded-xl">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Starting Waist
          </span>
          <span className="text-base sm:text-lg font-bold text-white mt-1 block">
            {formatNum(startingWaist, 1, "—", " cm")}
          </span>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Baseline</span>
        </div>

        {/* Current Waist */}
        <div className="bg-zinc-900/60 border border-zinc-800/70 p-3.5 rounded-xl">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Current Waist
          </span>
          <span className="text-base sm:text-lg font-bold text-white mt-1 block">
            {formatNum(currentWaist, 1, "—", " cm")}
          </span>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Latest measurement</span>
        </div>

        {/* Waist Change */}
        <div className="bg-zinc-900/60 border border-zinc-800/70 p-3.5 rounded-xl">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Waist Change
          </span>
          <span
            className={`text-base sm:text-lg font-bold mt-1 block ${
              waistChange !== null && waistChange < 0
                ? "text-emerald-400"
                : waistChange !== null && waistChange > 0
                ? "text-amber-400"
                : "text-zinc-300"
            }`}
          >
            {waistChange !== null ? formatDiff(waistChange, 1, "cm") : "—"}
          </span>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Since baseline</span>
        </div>

        {/* Diet Adherence */}
        <div className="bg-zinc-900/60 border border-zinc-800/70 p-3.5 rounded-xl">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Diet Adherence
          </span>
          <span
            className={`text-base sm:text-lg font-bold mt-1 block ${
              avgDiet !== null && avgDiet >= 85
                ? "text-emerald-400"
                : avgDiet !== null && avgDiet >= 70
                ? "text-amber-400"
                : avgDiet !== null
                ? "text-rose-400"
                : "text-zinc-300"
            }`}
          >
            {avgDiet !== null ? `${Math.round(avgDiet)}%` : "—"}
          </span>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Period average</span>
        </div>

        {/* Training Adherence */}
        <div className="bg-zinc-900/60 border border-zinc-800/70 p-3.5 rounded-xl">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Training Adherence
          </span>
          <span
            className={`text-base sm:text-lg font-bold mt-1 block ${
              avgTraining !== null && avgTraining >= 85
                ? "text-emerald-400"
                : avgTraining !== null && avgTraining >= 70
                ? "text-amber-400"
                : avgTraining !== null
                ? "text-rose-400"
                : "text-zinc-300"
            }`}
          >
            {avgTraining !== null ? `${Math.round(avgTraining)}%` : "—"}
          </span>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Period average</span>
        </div>

        {/* Average Sleep & Steps */}
        <div className="bg-zinc-900/60 border border-zinc-800/70 p-3.5 rounded-xl">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Steps / Sleep
          </span>
          <span className="text-base sm:text-lg font-bold text-white mt-1 block truncate">
            {avgSteps !== null ? `${Math.round(avgSteps).toLocaleString()} st` : "—"}
          </span>
          <span className="text-[10px] text-zinc-400 block mt-0.5">
            {avgSleep !== null ? `${formatNum(avgSleep, 1)} hrs sleep` : "Awaiting check-in"}
          </span>
        </div>
      </div>

      {/* ─── OPTIONAL PERFORMANCE PR ROW (if metrics exist) ─── */}
      {performanceMetrics.length > 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800/70 p-3.5 rounded-xl">
          <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Key Performance Personal Records</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {performanceMetrics.slice(0, 4).map((m) => (
              <div
                key={m.id}
                className="bg-zinc-950/70 border border-zinc-800/80 p-2.5 rounded-lg flex items-center justify-between"
              >
                <div className="truncate mr-2">
                  <span className="text-xs font-semibold text-zinc-200 block truncate">
                    {m.name}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    PR: <strong className="text-amber-400 font-bold">{formatNum(m.best_value, 1)} {m.unit}</strong>
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-white block">
                    {formatNum(m.current_value, 1)} {m.unit}
                  </span>
                  <span
                    className={`text-[10px] font-medium ${
                      m.absolute_change != null && m.absolute_change > 0
                        ? "text-emerald-400"
                        : m.absolute_change != null && m.absolute_change < 0
                        ? "text-rose-400"
                        : "text-zinc-500"
                    }`}
                  >
                    {m.absolute_change != null ? formatDiff(m.absolute_change, 1) : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

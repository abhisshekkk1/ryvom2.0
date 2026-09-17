"use client";

import React from "react";
import { Scale, Activity, CheckCircle, Clock, Dumbbell } from "lucide-react";
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
  completedCheckins,
  missedCheckins,
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
      {/* ─── Body Section ─── */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
          <Scale className="w-3.5 h-3.5 text-amber-400" />
          Body Composition
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Starting Weight</span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {formatNum(startingWeight, 1, "", " kg")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Current Weight</span>
            <span className="text-lg font-bold text-amber-400 mt-0.5 block">
              {formatNum(currentWeight, 1, "", " kg")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Total Change</span>
            <span
              className={`text-lg font-bold mt-0.5 block ${
                weightChange !== null && weightChange < 0
                  ? "text-emerald-400"
                  : weightChange !== null && weightChange > 0
                  ? "text-amber-400"
                  : "text-zinc-300"
              }`}
            >
              {formatDiff(weightChange, 1, "kg")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Target Weight</span>
            <span className="text-lg font-bold text-zinc-200 mt-0.5 block">
              {formatNum(targetWeight, 1, "", " kg")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Remaining to Target</span>
            <span className="text-lg font-bold text-zinc-200 mt-0.5 block">
              {remainingWeight !== null
                ? `${Math.abs(remainingWeight).toFixed(1)} kg ${remainingWeight > 0 ? "to lose" : remainingWeight < 0 ? "to gain" : "reached"}`
                : "-"}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Starting Waist</span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {formatNum(startingWaist, 1, "", " cm")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Current Waist</span>
            <span className="text-lg font-bold text-amber-400 mt-0.5 block">
              {formatNum(currentWaist, 1, "", " cm")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Waist Change</span>
            <span
              className={`text-lg font-bold mt-0.5 block ${
                waistChange !== null && waistChange < 0
                  ? "text-emerald-400"
                  : waistChange !== null && waistChange > 0
                  ? "text-rose-400"
                  : "text-zinc-300"
              }`}
            >
              {formatDiff(waistChange, 1, "cm")}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Consistency Section ─── */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          Adherence & Consistency
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Avg Diet Adherence</span>
            <span
              className={`text-lg font-bold mt-0.5 block ${
                avgDiet !== null && avgDiet >= 85
                  ? "text-emerald-400"
                  : avgDiet !== null && avgDiet >= 70
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {formatNum(avgDiet, 0, "", "%")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Avg Training Adherence</span>
            <span
              className={`text-lg font-bold mt-0.5 block ${
                avgTraining !== null && avgTraining >= 85
                  ? "text-emerald-400"
                  : avgTraining !== null && avgTraining >= 70
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {formatNum(avgTraining, 0, "", "%")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Average Steps</span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {formatNum(avgSteps, 0)}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium block">Average Sleep</span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {formatNum(avgSleep, 1, "", " h")}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Completed Check-ins
            </span>
            <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
              {completedCheckins}
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" />
              Missed / Overdue
            </span>
            <span
              className={`text-lg font-bold mt-0.5 block ${
                missedCheckins > 0 ? "text-amber-400" : "text-zinc-400"
              }`}
            >
              {missedCheckins}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Performance Highlights (if metrics exist) ─── */}
      {performanceMetrics.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Dumbbell className="w-3.5 h-3.5 text-amber-400" />
            Performance PR Highlights
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {performanceMetrics.slice(0, 4).map((m) => (
              <div
                key={m.id}
                className="bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-semibold text-zinc-300 block">
                    {m.name}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    PR:{" "}
                    <span className="text-amber-400 font-semibold">
                      {formatNum(m.best_value, 1, "", ` ${m.unit}`)}
                    </span>
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-white block">
                    {formatNum(m.current_value, 1, "", ` ${m.unit}`)}
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
                    {formatDiff(m.absolute_change, 1)} ({formatDiff(m.percentage_change, 1, "%")})
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

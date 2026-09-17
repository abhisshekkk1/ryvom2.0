"use client";

import React, { useState } from "react";
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus, GitCompare } from "lucide-react";
import { CheckIn } from "@/lib/types";
import { computePeriodComparison, formatNum, formatDiff } from "@/lib/progressAnalytics";

interface PeriodComparisonViewProps {
  checkIns: CheckIn[];
}

export default function PeriodComparisonView({ checkIns }: PeriodComparisonViewProps) {
  const [periodLength, setPeriodLength] = useState<"4w" | "8w" | "12w">("4w");

  const comparison = computePeriodComparison(checkIns, periodLength);

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Period Comparison
          </h3>
          <span className="text-[11px] text-zinc-400">
            ({comparison.currentPeriodLabel} vs {comparison.previousPeriodLabel})
          </span>
        </div>

        <div className="inline-flex items-center p-0.5 bg-zinc-950 rounded-lg border border-zinc-800">
          {(["4w", "8w", "12w"] as const).map((len) => (
            <button
              key={len}
              type="button"
              onClick={() => setPeriodLength(len)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                periodLength === len
                  ? "bg-amber-400 text-zinc-950 shadow-xs"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {len.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {comparison.metrics.map((m) => {
          const hasData = m.currentValue !== null || m.previousValue !== null;
          const isBetter =
            m.difference !== null &&
            (m.label.includes("Adherence") || m.label.includes("Steps") || m.label.includes("Sleep") || m.label.includes("Energy")
              ? m.difference > 0
              : m.label.includes("Stress")
              ? m.difference < 0
              : null);

          return (
            <div
              key={m.label}
              className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs text-zinc-400 font-medium mb-1.5">
                <span className="text-zinc-300 font-semibold">{m.label}</span>
                <span className="text-[10px] text-zinc-400 font-mono">[{m.unit}]</span>
              </div>

              {hasData ? (
                <div>
                  <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
                    <span className="text-zinc-400 font-normal">
                      {m.previousValue !== null ? formatNum(m.previousValue, 1) : "—"}
                    </span>
                    <ArrowRight className="w-3 h-3 text-zinc-600" />
                    <span className="text-white font-bold">
                      {m.currentValue !== null ? formatNum(m.currentValue, 1) : "—"}
                    </span>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-zinc-850 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Difference:</span>
                    <div className="flex items-center gap-1">
                      {m.difference !== null ? (
                        <>
                          {m.difference > 0 && (
                            <ArrowUpRight className="w-3 h-3 text-amber-400" />
                          )}
                          {m.difference < 0 && (
                            <ArrowDownRight className="w-3 h-3 text-emerald-400" />
                          )}
                          {m.difference === 0 && <Minus className="w-3 h-3 text-zinc-500" />}
                          <span
                            className={`font-semibold ${
                              isBetter === true
                                ? "text-emerald-400"
                                : isBetter === false
                                ? "text-rose-400"
                                : m.difference !== 0
                                ? "text-amber-400"
                                : "text-zinc-400"
                            }`}
                          >
                            {formatDiff(m.difference, 1)} {m.unit}
                            {m.percentageDifference !== null && (
                              <span className="text-[10px] text-zinc-400 ml-1">
                                ({formatDiff(m.percentageDifference, 1, "%")})
                              </span>
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-400 italic text-[11px]">Insufficient data</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-400 italic py-1">
                  Insufficient data for this range
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { Calendar, SlidersHorizontal } from "lucide-react";
import { DateRangePreset } from "@/lib/types";

interface DateRangeSelectorProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  startDate?: string;
  endDate?: string;
  onCustomDatesChange?: (start: string, end: string) => void;
}

export default function DateRangeSelector({
  preset,
  onPresetChange,
  startDate,
  endDate,
  onCustomDatesChange,
}: DateRangeSelectorProps) {
  const presets: { id: DateRangePreset; label: string }[] = [
    { id: "4w", label: "4W" },
    { id: "8w", label: "8W" },
    { id: "12w", label: "12W" },
    { id: "6m", label: "6M" },
    { id: "1y", label: "1Y" },
    { id: "all", label: "All Time" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      {/* Segmented Control */}
      <div className="inline-flex items-center p-1 bg-zinc-900/90 border border-zinc-800/90 rounded-xl shadow-sm">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <SlidersHorizontal className="w-3 h-3 text-zinc-400" />
          <span>Range</span>
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
          {presets.map((p) => {
            const isActive = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPresetChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
                  isActive
                    ? "bg-amber-400 text-zinc-950 font-bold shadow-xs"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/80 font-medium"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Date Inputs */}
      {preset === "custom" && (
        <div className="flex items-center gap-2 text-xs bg-zinc-900/90 border border-zinc-800/90 px-3 py-1.5 rounded-xl shadow-sm text-zinc-300">
          <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <input
            type="date"
            aria-label="Start date"
            value={startDate || ""}
            onChange={(e) =>
              onCustomDatesChange?.(e.target.value, endDate || "")
            }
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <span className="text-zinc-500 font-medium">to</span>
          <input
            type="date"
            aria-label="End date"
            value={endDate || ""}
            onChange={(e) =>
              onCustomDatesChange?.(startDate || "", e.target.value)
            }
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>
      )}
    </div>
  );
}

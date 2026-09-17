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
    { id: "4w", label: "4 Weeks" },
    { id: "8w", label: "8 Weeks" },
    { id: "12w", label: "12 Weeks" },
    { id: "6m", label: "6 Months" },
    { id: "1y", label: "1 Year" },
    { id: "all", label: "All Time" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/80 border border-zinc-800/80 p-2.5 rounded-xl shadow-inner backdrop-blur-sm">
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 px-2 mr-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
          Range:
        </span>
        {presets.map((p) => {
          const isActive = preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPresetChange(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-amber-400 text-zinc-950 shadow-md font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {preset === "custom" && (
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <Calendar className="w-4 h-4 text-amber-400" />
          <input
            type="date"
            value={startDate || ""}
            onChange={(e) =>
              onCustomDatesChange?.(e.target.value, endDate || "")
            }
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
          />
          <span className="text-zinc-500">to</span>
          <input
            type="date"
            value={endDate || ""}
            onChange={(e) =>
              onCustomDatesChange?.(startDate || "", e.target.value)
            }
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>
      )}
    </div>
  );
}

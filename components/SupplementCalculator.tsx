"use client";

import { useState } from "react";
import { calculateSupplementDosages, SupplementRecommendation } from "@/lib/supplementLogic";

export default function SupplementCalculator() {
  const [weightKg, setWeightKg] = useState<number>(104);

  const supplements: SupplementRecommendation[] = calculateSupplementDosages(weightKg);

  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
      
      {/* Header & Weight Input Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xl shrink-0">
              💊
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Supplement Dosage Calculator
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Personalized daily supplement recommendations scaled to body mass and clinical standards.
              </p>
            </div>
          </div>
        </div>

        {/* Input Field for Weight */}
        <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 shrink-0 self-start sm:self-auto shadow-inner">
          <label htmlFor="supplement-weight-input" className="text-xs font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
            Body Mass (kg):
          </label>
          <input
            id="supplement-weight-input"
            type="number"
            min="30"
            max="300"
            step="0.5"
            value={weightKg === 0 ? "" : weightKg}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setWeightKg(isNaN(val) ? 0 : val);
            }}
            placeholder="104"
            className="w-24 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm font-black text-red-500 text-center focus:outline-none focus:border-red-500 transition shadow-sm"
          />
        </div>
      </div>

      {/* Grid of Supplements */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {supplements.map((item) => {
          const isWeightBased = item.scalingType === "weight-based";
          return (
            <div
              key={item.id}
              className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition duration-200 shadow-md group"
            >
              {/* Card Header & Content */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl group-hover:scale-110 transition-transform duration-200">
                      {item.icon}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                      {item.name}
                    </h3>
                  </div>

                  {/* UI Badges */}
                  {isWeightBased ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/10 border border-red-500/30 text-red-400 tracking-wide uppercase shrink-0">
                      Weight Adjusted
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-zinc-800 border border-zinc-700 text-zinc-400 tracking-wide uppercase shrink-0">
                      Fixed Dose
                    </span>
                  )}
                </div>

                {/* Dosage Value */}
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Recommended Target
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-red-500 tracking-tight mt-0.5">
                    {item.dosage}
                  </div>
                </div>

                {/* Timing Advice */}
                {item.timing && (
                  <div className="text-xs text-zinc-300 font-medium flex items-center gap-1.5 pt-0.5">
                    <span className="text-zinc-500">⏱️</span>
                    <span>{item.timing}</span>
                  </div>
                )}
              </div>

              {/* Card Footer Note */}
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400 leading-relaxed">
                {item.note}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

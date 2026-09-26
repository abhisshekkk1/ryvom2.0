"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Camera, ArrowRight, Grid, Columns } from "lucide-react";
import { CheckIn } from "@/lib/types";
import { sortCheckInsChronologically } from "@/lib/progressAnalytics";
import { isSignedPhotoUrl } from "@/lib/photoStorage";

interface PhotoCompareViewProps {
  checkIns: CheckIn[];
}

export default function PhotoCompareView({ checkIns }: PhotoCompareViewProps) {
  const [viewMode, setViewMode] = useState<"compare" | "timeline">("compare");
  const [angle, setAngle] = useState<"front" | "side" | "back">("front");

  // Sorted check-ins with at least one photo
  const photoCheckIns = sortCheckInsChronologically(checkIns).filter(
    (c) => c.photo_front_url || c.photo_side_url || c.photo_back_url
  );

  // Selected dates for comparison
  const [beforeId, setBeforeId] = useState<string>(
    photoCheckIns.length > 0 ? photoCheckIns[0].id : ""
  );
  const [afterId, setAfterId] = useState<string>(
    photoCheckIns.length > 1
      ? photoCheckIns[photoCheckIns.length - 1].id
      : photoCheckIns.length === 1
      ? photoCheckIns[0].id
      : ""
  );

  const beforeCheckIn = photoCheckIns.find((c) => c.id === beforeId);
  const afterCheckIn = photoCheckIns.find((c) => c.id === afterId);

  // Helper for quick comparison presets
  const applyPresetWeeks = (weeks: number) => {
    if (photoCheckIns.length < 2) return;
    const latest = photoCheckIns[photoCheckIns.length - 1];
    setAfterId(latest.id);

    const latestMs = new Date(latest.week_ending).getTime();
    const targetMs = latestMs - weeks * 7 * 86400000;

    // Find closest check-in before or near target
    let closest = photoCheckIns[0];
    let minDiff = Math.abs(new Date(closest.week_ending).getTime() - targetMs);

    for (const c of photoCheckIns) {
      const diff = Math.abs(new Date(c.week_ending).getTime() - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = c;
      }
    }
    setBeforeId(closest.id);
  };

  const getRawPhotoPath = (checkIn?: CheckIn, photoAngle: "front" | "side" | "back" = "front") => {
    if (!checkIn) return null;
    if (photoAngle === "front") return checkIn.photo_front_url;
    if (photoAngle === "side") return checkIn.photo_side_url;
    if (photoAngle === "back") return checkIn.photo_back_url;
    return null;
  };

  const getPhotoUrl = (checkIn?: CheckIn, photoAngle: "front" | "side" | "back" = "front") => {
    const raw = getRawPhotoPath(checkIn, photoAngle);
    if (!raw || !isSignedPhotoUrl(raw)) return null;
    return raw;
  };

  const isPhotoPending = (checkIn?: CheckIn, photoAngle: "front" | "side" | "back" = "front") => {
    const raw = getRawPhotoPath(checkIn, photoAngle);
    return !!raw && !isSignedPhotoUrl(raw);
  };

  if (photoCheckIns.length === 0) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-xl text-center flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-amber-400 mb-3">
          <Camera className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-white">No progress photos uploaded yet</h4>
        <p className="text-xs text-zinc-400 max-w-sm mt-1">
          When front, side, or back photos are uploaded with weekly check-ins, they will appear here for side-by-side comparison and timeline analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Controls: Mode Switcher & Angle Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/90 border border-zinc-800/80 p-3 rounded-xl">
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setViewMode("compare")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === "compare"
                ? "bg-amber-400 text-zinc-950"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            Before vs After
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === "timeline"
                ? "bg-amber-400 text-zinc-950"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            Photo Timeline
          </button>
        </div>

        {/* Angle selector */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          {(["front", "side", "back"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAngle(a)}
              className={`px-3 py-1 text-xs font-semibold capitalize rounded-md transition-colors cursor-pointer ${
                angle === a
                  ? "bg-zinc-800 text-amber-400 border border-amber-400/40"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "compare" ? (
        <div className="space-y-4">
          {/* Presets and custom selectors */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950/60 border border-zinc-800/80 p-3 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-medium">Quick Compare:</span>
              <button
                onClick={() => applyPresetWeeks(4)}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 cursor-pointer"
              >
                4 Weeks
              </button>
              <button
                onClick={() => applyPresetWeeks(8)}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 cursor-pointer"
              >
                8 Weeks
              </button>
              <button
                onClick={() => applyPresetWeeks(12)}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 cursor-pointer"
              >
                12 Weeks
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">Before:</span>
                <select
                  value={beforeId}
                  onChange={(e) => setBeforeId(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                >
                  {photoCheckIns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </option>
                  ))}
                </select>
              </div>

              <ArrowRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">After:</span>
                <select
                  value={afterId}
                  onChange={(e) => setAfterId(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                >
                  {photoCheckIns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Side by side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Before card */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-amber-400 uppercase tracking-wider">
                  BEFORE
                </span>
                <span className="text-zinc-400 font-medium">
                  {beforeCheckIn
                    ? new Date(beforeCheckIn.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </span>
              </div>

              <div className="relative w-full aspect-[3/4] max-h-[480px] bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center border border-zinc-800">
                {getPhotoUrl(beforeCheckIn, angle) ? (
                  <Image
                    src={getPhotoUrl(beforeCheckIn, angle)!}
                    alt="Before photo"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                ) : isPhotoPending(beforeCheckIn, angle) ? (
                  <div className="text-zinc-500 text-xs flex flex-col items-center gap-1.5 animate-pulse">
                    <Camera className="w-6 h-6 opacity-60 text-amber-400" />
                    <span>Loading secure photo...</span>
                  </div>
                ) : (
                  <div className="text-zinc-600 text-xs flex flex-col items-center gap-1">
                    <Camera className="w-6 h-6 opacity-40" />
                    No {angle} photo for this date
                  </div>
                )}
              </div>

              {beforeCheckIn && (
                <div className="w-full mt-3 pt-3 border-t border-zinc-800 grid grid-cols-2 gap-2 text-xs text-center">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Weight</span>
                    <span className="font-bold text-white">
                      {beforeCheckIn.weight ? `${beforeCheckIn.weight} kg` : "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Waist</span>
                    <span className="font-bold text-white">
                      {beforeCheckIn.waist_cm ? `${beforeCheckIn.waist_cm} cm` : "-"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* After Box */}
            <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-4 flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  After
                </span>
                <span className="text-xs text-zinc-400 font-medium">
                  {afterCheckIn
                    ? new Date(afterCheckIn.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </span>
              </div>

              <div className="relative w-full aspect-[3/4] max-h-[480px] bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center border border-zinc-800">
                {getPhotoUrl(afterCheckIn, angle) ? (
                  <Image
                    src={getPhotoUrl(afterCheckIn, angle)!}
                    alt="After photo"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                ) : isPhotoPending(afterCheckIn, angle) ? (
                  <div className="text-zinc-500 text-xs flex flex-col items-center gap-1.5 animate-pulse">
                    <Camera className="w-6 h-6 opacity-60 text-amber-400" />
                    <span>Loading secure photo...</span>
                  </div>
                ) : (
                  <div className="text-zinc-600 text-xs flex flex-col items-center gap-1">
                    <Camera className="w-6 h-6 opacity-40" />
                    No {angle} photo for this date
                  </div>
                )}
              </div>

              {afterCheckIn && (
                <div className="w-full mt-3 pt-3 border-t border-zinc-800 grid grid-cols-2 gap-2 text-xs text-center">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Weight</span>
                    <span className="font-bold text-white">
                      {afterCheckIn.weight ? `${afterCheckIn.weight} kg` : "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Waist</span>
                    <span className="font-bold text-white">
                      {afterCheckIn.waist_cm ? `${afterCheckIn.waist_cm} cm` : "-"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Chronological Photo Timeline */
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...photoCheckIns].reverse().map((c) => {
              const url = getPhotoUrl(c, angle);
              return (
                <div
                  key={c.id}
                  className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-col"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-400 font-medium mb-2">
                    <span>
                      {new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {c.weight && (
                      <span className="text-amber-400 font-semibold">{c.weight} kg</span>
                    )}
                  </div>

                  <div className="relative w-full aspect-[3/4] bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center border border-zinc-800">
                    {url ? (
                      <Image
                        src={url}
                        alt={`${angle} photo`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : isPhotoPending(c, angle) ? (
                      <div className="text-zinc-500 text-[11px] text-center p-2 animate-pulse flex flex-col items-center gap-1">
                        <Camera className="w-4 h-4 opacity-60 text-amber-400" />
                        <span>Loading...</span>
                      </div>
                    ) : (
                      <div className="text-zinc-600 text-[11px] text-center p-2">
                        No {angle} photo
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Waist: {c.waist_cm ? `${c.waist_cm}cm` : "-"}</span>
                    <button
                      onClick={() => {
                        setAfterId(c.id);
                        setViewMode("compare");
                      }}
                      className="text-amber-400 hover:underline cursor-pointer"
                    >
                      Compare
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

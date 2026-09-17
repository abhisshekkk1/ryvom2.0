"use client";

import React, { useState } from "react";
import { Dumbbell, Plus, Trophy, Trash2 } from "lucide-react";
import { PerformanceWithLogs, MetricType } from "@/lib/types";
import { formatNum, formatDiff } from "@/lib/progressAnalytics";
import InteractiveChart from "./InteractiveChart";

interface PerformanceTrackerProps {
  clientId?: string;
  metrics: PerformanceWithLogs[];
  onAddMetric: (metric: {
    name: string;
    unit: string;
    metric_type: MetricType;
    target_value: number | null;
    track_on_checkin: boolean;
    show_on_dashboard: boolean;
  }) => Promise<void>;
  onLogPerformance: (metricId: string, log: {
    logged_date: string;
    value: number;
    notes?: string;
  }) => Promise<void>;
  onDeleteMetric?: (metricId: string) => Promise<void>;
  onDeleteLog?: (logId: string) => Promise<void>;
}

export default function PerformanceTracker({
  metrics,
  onAddMetric,
  onLogPerformance,
  onDeleteMetric,
  onDeleteLog,
}: PerformanceTrackerProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(
    metrics.length > 0 ? metrics[0].id : null
  );
  const [showLogModal, setShowLogModal] = useState(false);

  // Add metric form state
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [metricType, setMetricType] = useState<MetricType>("weight");
  const [targetValue, setTargetValue] = useState<string>("");
  const [trackOnCheckin, setTrackOnCheckin] = useState(false);
  const [showOnDashboard, setShowOnDashboard] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Log entry form state
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [logValue, setLogValue] = useState<string>("");
  const [logNotes, setLogNotes] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  const activeMetric = metrics.find((m) => m.id === selectedMetricId) || metrics[0];

  const handleCreateMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddMetric({
        name: name.trim(),
        unit: unit.trim(),
        metric_type: metricType,
        target_value: targetValue ? parseFloat(targetValue) : null,
        track_on_checkin: trackOnCheckin,
        show_on_dashboard: showOnDashboard,
      });
      setName("");
      setTargetValue("");
      setShowAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMetric || !logValue) return;
    setIsLogging(true);
    try {
      await onLogPerformance(activeMetric.id, {
        logged_date: logDate,
        value: parseFloat(logValue),
        notes: logNotes.trim() || undefined,
      });
      setLogValue("");
      setLogNotes("");
      setShowLogModal(false);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Add Metric Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/90 border border-zinc-800/80 p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Performance & Strength Tracking
            </h3>
            <p className="text-xs text-zinc-400">
              Track custom lifts, cardio benchmarks, and physical PRs over time
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeMetric && (
            <button
              onClick={() => setShowLogModal(true)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Entry
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Metric
          </button>
        </div>
      </div>

      {metrics.length === 0 ? (
        <div className="bg-zinc-900/80 border border-zinc-800/80 p-8 rounded-xl text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-amber-400 mb-3">
            <Dumbbell className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-white">No performance metrics added yet</h4>
          <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-4">
            Track key lifts (e.g. Bench Press, Squat, Deadlift) or cardio metrics (e.g. 5k run pace) to see physical progress over weeks.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Create First Metric
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* PR / Best Value Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.map((m) => {
              const isSelected = (selectedMetricId || metrics[0].id) === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMetricId(m.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-zinc-900 border-amber-400/80 shadow-md shadow-amber-400/5 ring-1 ring-amber-400/40"
                      : "bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
                      {m.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase bg-zinc-800 px-1.5 py-0.5 rounded">
                      {m.metric_type}
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Current</span>
                      <span className="text-lg font-bold text-white">
                        {formatNum(m.current_value, 1, "", ` ${m.unit}`)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-zinc-400 flex items-center justify-end gap-1">
                        <Trophy className="w-3 h-3 text-amber-400" />
                        PR / Best
                      </span>
                      <span className="text-base font-bold text-amber-400">
                        {formatNum(m.best_value, 1, "", ` ${m.unit}`)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Change:</span>
                    <span
                      className={`font-semibold ${
                        m.absolute_change != null && m.absolute_change > 0
                          ? "text-emerald-400"
                          : m.absolute_change != null && m.absolute_change < 0
                          ? "text-rose-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {formatDiff(m.absolute_change, 1, m.unit)}
                      {m.percentage_change != null && (
                        <span className="text-[10px] text-zinc-500 ml-1">
                          ({formatDiff(m.percentage_change, 1, "%")})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Metric Chart & Log History */}
          {activeMetric && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Trend Chart */}
              <div className="lg:col-span-2">
                <InteractiveChart
                  title={`${activeMetric.name} Progress`}
                  data={activeMetric.logs.map((l) => ({
                    date: l.logged_date,
                    formattedDate: new Date(l.logged_date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    }),
                    value: l.value,
                  }))}
                  unit={` ${activeMetric.unit}`}
                  targetValue={activeMetric.target_value}
                  color="#f59e0b"
                />
              </div>

              {/* History Table */}
              <div className="bg-zinc-900/90 border border-zinc-800/80 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                    <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      {activeMetric.name} Log History
                    </span>
                    <button
                      onClick={() => setShowLogModal(true)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                    >
                      + Add Log
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {activeMetric.logs.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic py-4 text-center">
                        No logs recorded yet.
                      </p>
                    ) : (
                      [...activeMetric.logs].reverse().map((log) => (
                        <div
                          key={log.id}
                          className="bg-zinc-950/80 border border-zinc-800/80 p-2.5 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-white block">
                              {log.value} {activeMetric.unit}
                            </span>
                            {log.notes && (
                              <span className="text-[10px] text-zinc-400 block line-clamp-1">
                                {log.notes}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500">
                              {new Date(log.logged_date).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            {onDeleteLog && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm("Delete this log entry?")) {
                                    onDeleteLog(log.id);
                                  }
                                }}
                                className="text-zinc-600 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                                title="Delete log entry"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {onDeleteMetric && (
                  <div className="pt-3 mt-3 border-t border-zinc-800/80 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${activeMetric.name} and all its logs?`)) {
                          onDeleteMetric(activeMetric.id);
                        }
                      }}
                      className="text-xs text-rose-400/80 hover:text-rose-400 flex items-center gap-1 ml-auto cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Metric
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Metric Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-amber-400" />
              Create Custom Performance Metric
            </h3>
            <form onSubmit={handleCreateMetric} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Metric Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bench Press, Squat, 5k Pace"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Metric Type
                  </label>
                  <select
                    value={metricType}
                    onChange={(e) => setMetricType(e.target.value as MetricType)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="weight">Weight</option>
                    <option value="reps">Reps</option>
                    <option value="distance">Distance</option>
                    <option value="time">Time</option>
                    <option value="percentage">Percentage</option>
                    <option value="number">Number</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="kg, lbs, reps, min"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Target Value (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 100"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trackOnCheckin}
                    onChange={(e) => setTrackOnCheckin(e.target.checked)}
                    className="rounded border-zinc-700 text-amber-400 focus:ring-0"
                  />
                  Prompt to track on weekly check-in
                </label>

                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnDashboard}
                    onChange={(e) => setShowOnDashboard(e.target.checked)}
                    className="rounded border-zinc-700 text-amber-400 focus:ring-0"
                  />
                  Show on progress dashboard summary
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 text-xs text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Metric"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Performance Entry Modal */}
      {showLogModal && activeMetric && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-400" />
              Log {activeMetric.name} Entry
            </h3>
            <form onSubmit={handleCreateLog} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Value ({activeMetric.unit}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder={`e.g. 100`}
                    value={logValue}
                    onChange={(e) => setLogValue(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Felt smooth, 3 reps in reserve, new grip width"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-3 py-2 text-xs text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLogging}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLogging ? "Saving..." : "Save Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

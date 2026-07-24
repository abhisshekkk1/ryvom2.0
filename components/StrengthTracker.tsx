"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toPng } from "html-to-image";
import { supabase } from "@/lib/supabase";
import { resolveActiveUserId } from "@/lib/userHelper";

export type LiftType = "Squat" | "Bench Press" | "Deadlift";
export type LiftFilter = "ALL" | LiftType;
export type TimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

export interface LiftLogEntry {
  id: string;
  lift_type: LiftType;
  weight_kg: number;
  sets: number;
  reps: number;
  notes?: string;
  tags?: string[];
  logged_date: string;
}

export interface WeightLogEntry {
  id: string;
  weight_kg: number;
  logged_date: string;
}

export interface DraftSetRow {
  id: string;
  setNum: number;
  weightKg: number | string;
  reps: number | string;
  rir: string;
  completed: boolean;
}

interface StrengthTrackerProps {
  user?: any;
  readOnly?: boolean;
}

// Powerlifting specific predefined tags
export const PREDEFINED_TAGS = [
  "1RM",
  "Paused",
  "Barefoot",
  "Beltless",
  "Myo Reps",
  "Drop Set",
];

export const RIR_OPTIONS = [
  "0 RIR (Failure)",
  "1 RIR",
  "2 RIR",
  "3 RIR",
  "4+ RIR",
];

// Human maximum weight limits in kg per lift
export const LIFT_MAX_LIMITS: Record<LiftType, number> = {
  Deadlift: 500,
  "Bench Press": 450,
  Squat: 600,
};

// Roast array for sarcastic validation errors when weight exceeds human limits
const sarcasticErrors = [
  "Did you accidentally park a Honda Civic on the bar?",
  "Eddie Hall called, he wants his world record back.",
  "Ego lifting in a database? That's a new low.",
  "Are you lifting on Jupiter? Check your math.",
  "Bro thinks he's an Avenger. Lower the weight.",
  "NASA is looking for someone to manually launch the next shuttle. You in?",
  "I didn't realize we had a literal forklift using this app.",
  "Your keyboard must be broken, because nobody is lifting that.",
];

// Color palette map per lift type
const LIFT_COLORS: Record<LiftType, { primary: string; bg: string; border: string; icon: string }> = {
  Squat: { primary: "#ff334b", bg: "rgba(255, 51, 75, 0.15)", border: "rgba(255, 51, 75, 0.3)", icon: "🍗" },
  "Bench Press": { primary: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)", border: "rgba(56, 189, 248, 0.3)", icon: "💪" },
  Deadlift: { primary: "#10b981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.3)", icon: "💀" },
};

export default function StrengthTracker({ user, readOnly = false }: StrengthTrackerProps) {
  // Logs & Loading States
  const [liftLogs, setLiftLogs] = useState<LiftLogEntry[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const strengthChartRef = useRef<HTMLDivElement>(null);

  // Export Strength Chart to Image Handler using html-to-image
  const handleExportChart = async () => {
    if (!strengthChartRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(strengthChartRef.current, {
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
      console.error("Export strength chart error:", err);
    } finally {
      setExporting(false);
    }
  };

  // Dynamic Session Logger Form States
  const [liftType, setLiftType] = useState<LiftType>("Squat");
  const [logDate, setLogDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>("");

  // Dynamic Set Rows State
  const [draftSets, setDraftSets] = useState<DraftSetRow[]>([
    { id: crypto.randomUUID(), setNum: 1, weightKg: 100, reps: 5, rir: "2 RIR", completed: true },
    { id: crypto.randomUUID(), setNum: 2, weightKg: 100, reps: 5, rir: "2 RIR", completed: false },
    { id: crypto.randomUUID(), setNum: 3, weightKg: 100, reps: 5, rir: "1 RIR", completed: false },
  ]);

  // Human limits validation state & computation
  const [sarcasticRoast, setSarcasticRoast] = useState<string>("");
  const maxAllowedLimit = LIFT_MAX_LIMITS[liftType] || 600;

  const isDraftWeightExceeded = useMemo(() => {
    return draftSets.some((row) => {
      const w = Number(row.weightKg) || 0;
      return w > maxAllowedLimit;
    });
  }, [draftSets, maxAllowedLimit]);

  useEffect(() => {
    if (isDraftWeightExceeded) {
      if (!sarcasticRoast) {
        const randomRoast = sarcasticErrors[Math.floor(Math.random() * sarcasticErrors.length)];
        setSarcasticRoast(randomRoast);
      }
    } else {
      setSarcasticRoast("");
    }
  }, [isDraftWeightExceeded, liftType, draftSets]);

  // Filters & Controls
  const [selectedLiftFilter, setSelectedLiftFilter] = useState<LiftFilter>("ALL");
  const [timeRange, setTimeRange] = useState<TimeRange>("3M");
  const [showBodyWeightOverlay, setShowBodyWeightOverlay] = useState<boolean>(true);

  // Inline Editing State for History View
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<number>(0);
  const [editSets, setEditSets] = useState<number>(0);
  const [editReps, setEditReps] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editTags, setEditTags] = useState<string[]>([]);

  // Fetch Lift Logs & Body Weight Logs from Supabase
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const targetUserId = await resolveActiveUserId(user);

      // 1. Fetch Lift Logs with notes and tags
      let query = supabase.from("lift_logs").select("*");
      if (targetUserId) query = query.eq("user_id", targetUserId);
      const { data: liftData, error: dbErr } = await query.order("logged_date", { ascending: true });

      if (liftData && liftData.length > 0) {
        const formatted: LiftLogEntry[] = liftData.map((d: any) => ({
          id: d.id,
          lift_type: d.lift_type,
          weight_kg: Number(d.weight_kg),
          sets: Number(d.sets || 1),
          reps: Number(d.reps),
          notes: d.notes || "",
          tags: Array.isArray(d.tags) ? d.tags : d.tags ? String(d.tags).split(",") : [],
          logged_date: d.logged_date,
        }));
        setLiftLogs(formatted);
      } else {
        // High quality powerlifting initial sample logs with tags & notes
        const sampleLifts: LiftLogEntry[] = [
          {
            id: "s-1",
            lift_type: "Squat",
            weight_kg: 120,
            sets: 1,
            reps: 5,
            tags: ["2 RIR", "Beltless"],
            notes: "Deep depth, focused on explosive hip drive",
            logged_date: new Date(Date.now() - 45 * 86400000).toISOString(),
          },
          {
            id: "s-2",
            lift_type: "Bench Press",
            weight_kg: 85,
            sets: 1,
            reps: 5,
            tags: ["Paused", "1 RIR"],
            notes: "1-second pause on chest, strong arch",
            logged_date: new Date(Date.now() - 40 * 86400000).toISOString(),
          },
          {
            id: "s-3",
            lift_type: "Deadlift",
            weight_kg: 140,
            sets: 1,
            reps: 5,
            tags: ["Barefoot", "2 RIR"],
            notes: "Hook grip, smooth lockout",
            logged_date: new Date(Date.now() - 35 * 86400000).toISOString(),
          },
          {
            id: "s-4",
            lift_type: "Squat",
            weight_kg: 125,
            sets: 1,
            reps: 5,
            tags: ["1 RIR"],
            notes: "Working set 3 felt crisp",
            logged_date: new Date(Date.now() - 30 * 86400000).toISOString(),
          },
          {
            id: "s-5",
            lift_type: "Bench Press",
            weight_kg: 87.5,
            sets: 1,
            reps: 5,
            tags: ["Paused"],
            notes: "Solid leg drive on final reps",
            logged_date: new Date(Date.now() - 25 * 86400000).toISOString(),
          },
          {
            id: "s-6",
            lift_type: "Deadlift",
            weight_kg: 150,
            sets: 1,
            reps: 5,
            tags: ["1 RIR", "Beltless"],
            notes: "Braced hard, minimal lower back fatigue",
            logged_date: new Date(Date.now() - 20 * 86400000).toISOString(),
          },
          {
            id: "s-7",
            lift_type: "Squat",
            weight_kg: 130,
            sets: 1,
            reps: 5,
            tags: ["1 RIR"],
            notes: "Pushed speed off the hole",
            logged_date: new Date(Date.now() - 15 * 86400000).toISOString(),
          },
          {
            id: "s-8",
            lift_type: "Bench Press",
            weight_kg: 90,
            sets: 1,
            reps: 5,
            tags: ["1RM", "Paused"],
            notes: "Heavy top set, clean bar path",
            logged_date: new Date(Date.now() - 10 * 86400000).toISOString(),
          },
          {
            id: "s-9",
            lift_type: "Deadlift",
            weight_kg: 160,
            sets: 1,
            reps: 3,
            tags: ["1RM", "1 RIR"],
            notes: "PR set! Strong pull off the floor",
            logged_date: new Date(Date.now() - 5 * 86400000).toISOString(),
          },
          {
            id: "s-10",
            lift_type: "Squat",
            weight_kg: 135,
            sets: 1,
            reps: 5,
            tags: ["1 RIR", "Beltless"],
            notes: "Today's main working set felt amazing",
            logged_date: new Date().toISOString(),
          },
        ];
        setLiftLogs(sampleLifts);
      }

      // 2. Fetch Weight Logs
      let wQuery = supabase.from("weight_logs").select("id, weight_kg, logged_date");
      if (targetUserId) wQuery = wQuery.eq("user_id", targetUserId);
      let { data: wData } = await wQuery.order("logged_date", { ascending: true });

      if (!wData || wData.length === 0) {
        let pQuery = supabase.from("progress").select("id, weight, date");
        if (targetUserId) pQuery = pQuery.eq("user_id", targetUserId);
        const { data: pData } = await pQuery.order("date", { ascending: true });
        if (pData) {
          wData = pData.map((p) => ({ id: p.id, weight_kg: Number(p.weight), logged_date: p.date }));
        }
      }

      if (wData && wData.length > 0) {
        setWeightLogs(
          wData.map((w: any) => ({
            id: w.id,
            weight_kg: Number(w.weight_kg || w.weight),
            logged_date: w.logged_date || w.date,
          }))
        );
      } else {
        setWeightLogs([
          { id: "bw-1", weight_kg: 83.0, logged_date: new Date(Date.now() - 45 * 86400000).toISOString() },
          { id: "bw-2", weight_kg: 81.8, logged_date: new Date(Date.now() - 30 * 86400000).toISOString() },
          { id: "bw-3", weight_kg: 80.5, logged_date: new Date(Date.now() - 15 * 86400000).toISOString() },
          { id: "bw-4", weight_kg: 79.2, logged_date: new Date().toISOString() },
        ]);
      }
    } catch (err: any) {
      console.error("StrengthTracker fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Draft Dynamic Set Row Controls
  const handleAddDraftSet = () => {
    const lastRow = draftSets[draftSets.length - 1];
    const newSetNum = draftSets.length + 1;
    const defaultWeight = lastRow ? lastRow.weightKg : 100;
    const defaultReps = lastRow ? lastRow.reps : 5;
    const defaultRir = lastRow ? lastRow.rir : "2 RIR";

    const newRow: DraftSetRow = {
      id: crypto.randomUUID(),
      setNum: newSetNum,
      weightKg: defaultWeight,
      reps: defaultReps,
      rir: defaultRir,
      completed: false,
    };

    setDraftSets([...draftSets, newRow]);
  };

  const handleDeleteDraftSet = (id: string) => {
    if (draftSets.length <= 1) {
      setError("Workout must contain at least one set row.");
      setTimeout(() => setError(null), 3000);
      return;
    }
    const filtered = draftSets.filter((row) => row.id !== id);
    const reindexed = filtered.map((row, idx) => ({ ...row, setNum: idx + 1 }));
    setDraftSets(reindexed);
  };

  const handleToggleComplete = (id: string) => {
    setDraftSets((prev) =>
      prev.map((row) => (row.id === id ? { ...row, completed: !row.completed } : row))
    );
  };

  const handleUpdateDraftRow = (id: string, field: keyof DraftSetRow, value: any) => {
    setDraftSets((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  // Toggle tag selection
  const toggleTag = (tag: string, currentList: string[], setList: (t: string[]) => void) => {
    if (currentList.includes(tag)) {
      setList(currentList.filter((t) => t !== tag));
    } else {
      setList([...currentList, tag]);
    }
  };

  // Database Submission Logic: Iterate over all checked completed sets & insert individually
  const handleFinishWorkout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isDraftWeightExceeded) {
      const roast = sarcasticRoast || sarcasticErrors[Math.floor(Math.random() * sarcasticErrors.length)];
      setError(`🛑 ${roast} (${liftType} max limit: ${maxAllowedLimit} kg)`);
      return;
    }

    // Filter checked/completed sets
    const completedRows = draftSets.filter((r) => r.completed);

    if (completedRows.length === 0) {
      setError("Please check at least one completed set row before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const targetUserId = await resolveActiveUserId(user);
      const isoDate = new Date(logDate).toISOString();

      const newEntriesToSave: LiftLogEntry[] = [];
      const dbPayloads: any[] = [];

      completedRows.forEach((row) => {
        const wKg = Number(row.weightKg) || 0;
        const rVal = Number(row.reps) || 0;

        if (wKg > 0 && rVal > 0) {
          // Combine RIR tag with general selected tags
          const mergedTags = Array.from(new Set([...selectedTags, row.rir])).filter(Boolean);
          const newId = crypto.randomUUID();

          const entry: LiftLogEntry = {
            id: newId,
            lift_type: liftType,
            weight_kg: wKg,
            sets: 1, // Row-by-row logging sets each entry set count to 1
            reps: rVal,
            notes: notes.trim(),
            tags: mergedTags,
            logged_date: isoDate,
          };

          newEntriesToSave.push(entry);

          dbPayloads.push({
            id: newId,
            user_id: targetUserId || null,
            lift_type: liftType,
            weight_kg: wKg,
            sets: 1,
            reps: rVal,
            notes: notes.trim(),
            tags: mergedTags,
            logged_date: isoDate,
          });
        }
      });

      if (dbPayloads.length === 0) {
        setError("Please ensure checked sets have valid positive weight and reps.");
        setSaving(false);
        return;
      }

      // Write individual set rows to Supabase lift_logs table
      const { error: dbErr } = await supabase.from("lift_logs").insert(dbPayloads);

      if (dbErr) {
        console.warn("Supabase insert warning (local fallback used):", dbErr.message);
      }

      // Refresh local state instantly
      setLiftLogs((prev) =>
        [...prev, ...newEntriesToSave].sort(
          (a, b) => new Date(a.logged_date).getTime() - new Date(b.logged_date).getTime()
        )
      );

      setFeedback(`✓ Finished ${liftType} Session! Logged ${dbPayloads.length} completed set(s).`);
      
      // Reset draft sets for next session
      setNotes("");
      setSelectedTags([]);
      setDraftSets([
        { id: crypto.randomUUID(), setNum: 1, weightKg: 100, reps: 5, rir: "2 RIR", completed: true },
        { id: crypto.randomUUID(), setNum: 2, weightKg: 100, reps: 5, rir: "2 RIR", completed: false },
        { id: crypto.randomUUID(), setNum: 3, weightKg: 100, reps: 5, rir: "1 RIR", completed: false },
      ]);

      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      console.error("Save workout error:", err);
      setError(err.message || "Failed to save workout session.");
    } finally {
      setSaving(false);
    }
  };

  // Quick Add Set inside a specific Session Block (pre-fills draft sets for that exercise)
  const handleQuickAddSessionSet = (sessionLift: LiftType, sessionDateStr: string, lastWeight: number, lastReps: number) => {
    setLiftType(sessionLift);
    setLogDate(sessionDateStr);
    
    // Set draft set 1 to last weight and reps
    setDraftSets([
      { id: crypto.randomUUID(), setNum: 1, weightKg: lastWeight, reps: lastReps, rir: "2 RIR", completed: true },
      { id: crypto.randomUUID(), setNum: 2, weightKg: lastWeight, reps: lastReps, rir: "1 RIR", completed: false },
    ]);

    const formElement = document.getElementById("lift-logging-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Delete log entry from history
  const handleDeleteLog = async (id: string) => {
    setLiftLogs((prev) => prev.filter((item) => item.id !== id));
    setFeedback("✓ Removed set from logs.");
    setTimeout(() => setFeedback(null), 3000);

    try {
      await supabase.from("lift_logs").delete().eq("id", id);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // Save inline edits for history view
  const handleSaveEdit = async (id: string) => {
    if (!editWeight || editWeight <= 0 || !editReps || editReps <= 0) return;

    setLiftLogs((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, weight_kg: editWeight, sets: editSets || 1, reps: editReps, notes: editNotes, tags: editTags }
          : item
      )
    );
    setEditingId(null);
    setFeedback("✓ Updated log entry!");
    setTimeout(() => setFeedback(null), 3000);

    try {
      await supabase
        .from("lift_logs")
        .update({
          weight_kg: editWeight,
          sets: editSets || 1,
          reps: editReps,
          notes: editNotes,
          tags: editTags,
        })
        .eq("id", id);
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  // Filtered logs based on selected lift & time range
  const filteredLiftLogs = useMemo(() => {
    let result = liftLogs;

    if (selectedLiftFilter !== "ALL") {
      result = result.filter((l) => l.lift_type === selectedLiftFilter);
    }

    if (timeRange !== "ALL") {
      const days = timeRange === "1M" ? 30 : timeRange === "3M" ? 90 : timeRange === "6M" ? 180 : 365;
      const cutoff = Date.now() - days * 86400000;
      const timeFiltered = result.filter((l) => new Date(l.logged_date).getTime() >= cutoff);
      if (timeFiltered.length > 0) result = timeFiltered;
    }

    return result.sort((a, b) => new Date(a.logged_date).getTime() - new Date(b.logged_date).getTime());
  }, [liftLogs, selectedLiftFilter, timeRange]);

  // Session-Based Grouping: Group logs by Date (YYYY-MM-DD) and Lift Type
  const sessionGroups = useMemo(() => {
    if (filteredLiftLogs.length === 0) return [];

    const groupsMap: Record<string, { key: string; dateStr: string; liftType: LiftType; dateObj: Date; items: LiftLogEntry[] }> = {};

    filteredLiftLogs.forEach((log) => {
      const dObj = new Date(log.logged_date);
      const dateStr = dObj.toISOString().split("T")[0];
      const groupKey = `${dateStr}_${log.lift_type}`;

      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = {
          key: groupKey,
          dateStr,
          liftType: log.lift_type,
          dateObj: dObj,
          items: [],
        };
      }
      groupsMap[groupKey].items.push(log);
    });

    return Object.values(groupsMap).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [filteredLiftLogs]);

  // Overall Statistics Calculation
  const stats = useMemo(() => {
    if (filteredLiftLogs.length === 0) return { maxWeight: 0, bestEst1RM: 0, totalVolume: 0, count: 0 };

    let maxW = 0;
    let best1RM = 0;
    let volume = 0;

    filteredLiftLogs.forEach((l) => {
      if (l.weight_kg > maxW) maxW = l.weight_kg;
      const est1RM = Math.round(l.weight_kg * (1 + l.reps / 30));
      if (est1RM > best1RM) best1RM = est1RM;
      volume += l.weight_kg * (l.sets || 1) * l.reps;
    });

    return { maxWeight: maxW, bestEst1RM: best1RM, totalVolume: Math.round(volume), count: filteredLiftLogs.length };
  }, [filteredLiftLogs]);

  // Chart data calculations (Dual trend scaling for Lifts vs Body Weight)
  const chartData = useMemo(() => {
    if (filteredLiftLogs.length === 0) {
      return { minLift: 50, maxLift: 150, minW: 60, maxW: 100, liftPoints: [], bodyWeightPoints: [] };
    }

    const liftWeights = filteredLiftLogs.map((l) => l.weight_kg);
    const minLift = Math.floor(Math.min(...liftWeights) * 0.9);
    const maxLift = Math.ceil(Math.max(...liftWeights) * 1.1) || 100;
    const liftRange = maxLift - minLift || 1;

    const liftPoints = filteredLiftLogs.map((l, index) => {
      const xPercent = (index / Math.max(1, filteredLiftLogs.length - 1)) * 100;
      const yPercent = 100 - ((l.weight_kg - minLift) / liftRange) * 100;
      return {
        ...l,
        xPercent,
        yPercent,
        formattedDate: new Date(l.logged_date).toLocaleDateString([], { month: "short", day: "numeric" }),
      };
    });

    const bwWeights = weightLogs.map((w) => w.weight_kg);
    const minW = bwWeights.length > 0 ? Math.floor(Math.min(...bwWeights) - 2) : 60;
    const maxW = bwWeights.length > 0 ? Math.ceil(Math.max(...bwWeights) + 2) : 100;
    const bwRange = maxW - minW || 1;

    const bodyWeightPoints = weightLogs.map((w, index) => {
      const xPercent = (index / Math.max(1, weightLogs.length - 1)) * 100;
      const yPercent = 100 - ((w.weight_kg - minW) / bwRange) * 100;
      return {
        ...w,
        xPercent,
        yPercent,
        formattedDate: new Date(w.logged_date).toLocaleDateString([], { month: "short", day: "numeric" }),
      };
    });

    return { minLift, maxLift, minW, maxW, liftPoints, bodyWeightPoints };
  }, [filteredLiftLogs, weightLogs]);

  // SVG Paths
  const svgLiftPath = useMemo(() => {
    if (chartData.liftPoints.length === 0) return "";
    return chartData.liftPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.xPercent * 3} ${p.yPercent * 1.5}`)
      .join(" ");
  }, [chartData.liftPoints]);

  const svgBWPath = useMemo(() => {
    if (chartData.bodyWeightPoints.length === 0) return "";
    return chartData.bodyWeightPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.xPercent * 3} ${p.yPercent * 1.5}`)
      .join(" ");
  }, [chartData.bodyWeightPoints]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏋️‍♂️</span>
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              Row-by-Row Powerlifting Logger
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Dynamic mobile spreadsheet logging for Squat, Bench Press, & Deadlift. Mark completed sets, track RIR/RPE & notes.
          </p>
        </div>

        {/* Lift Filter Toggles */}
        <div className="flex items-center gap-1.5 bg-[#0b0b0e] p-1.5 rounded-xl border border-zinc-800 self-start md:self-auto overflow-x-auto">
          {(["ALL", "Squat", "Bench Press", "Deadlift"] as LiftFilter[]).map((f) => {
            const isSelected = selectedLiftFilter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setSelectedLiftFilter(f)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  isSelected
                    ? "bg-[#ff334b] text-white shadow-md shadow-[#ff334b]/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`}
              >
                {f === "ALL" ? "🔥 All Lifts" : f}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#121216] border border-zinc-800/80 shadow-lg">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            🏆 Max Weight ({selectedLiftFilter})
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {stats.maxWeight} <span className="text-xs font-normal text-zinc-400">kg</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#121216] border border-rose-900/40 bg-rose-950/10 shadow-lg">
          <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
            ⚡ Best Estimated 1RM
          </div>
          <div className="text-2xl font-black text-rose-300 mt-1">
            {stats.bestEst1RM} <span className="text-xs font-normal text-rose-500">kg</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#121216] border border-cyan-900/40 bg-cyan-950/10 shadow-lg">
          <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
            📦 Total Volume
          </div>
          <div className="text-2xl font-black text-cyan-300 mt-1">
            {stats.totalVolume.toLocaleString()} <span className="text-xs font-normal text-cyan-500">kg</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#121216] border border-emerald-900/40 bg-emerald-950/10 shadow-lg">
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
            📊 Completed Sets Logged
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-1">
            {stats.count} <span className="text-xs font-normal text-emerald-500">sets</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Main Grid: Dynamic Row Logger + Session History */}
      <div className={readOnly ? "space-y-6" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
        {/* Dynamic Row-by-Row Exercise Logging Interface */}
        {!readOnly && (
          <div id="lift-logging-form" className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-5">
            {/* Header Block: Exercise Selection & Date */}
            <div className="border-b border-zinc-800/80 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{LIFT_COLORS[liftType]?.icon || "🏋️‍♂️"}</span>
                  <h3 className="text-base font-extrabold text-white tracking-tight">
                    Exercise Session Logger
                  </h3>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Row-by-Row
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Exercise
                  </label>
                  <select
                    value={liftType}
                    onChange={(e) => setLiftType(e.target.value as LiftType)}
                    className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-[#ff334b] transition"
                  >
                    <option value="Squat">🍗 Squat</option>
                    <option value="Bench Press">💪 Bench Press</option>
                    <option value="Deadlift">💀 Deadlift</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff334b] transition font-medium"
                  />
                </div>
              </div>

              {/* Tags Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>🏷️ Powerlifting Tags</span>
                  <span className="text-[10px] text-zinc-500">Multi-select</span>
                </label>
                <div className="flex flex-wrap gap-1">
                  {PREDEFINED_TAGS.map((t) => {
                    const isSelected = selectedTags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t, selectedTags, setSelectedTags)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition border ${
                          isSelected
                            ? "bg-[#ff334b] text-white border-[#ff334b]"
                            : "bg-[#0b0b0e] text-zinc-400 border-zinc-800 hover:text-white"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Session Notes Textarea */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  📝 Session Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Explosive bar speed, light knee sleeves, good arch."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#ff334b] transition resize-none"
                />
              </div>
            </div>

            {/* Mobile-First Spreadsheet Set Rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                <span>Working Sets ({draftSets.length})</span>
                <span className="text-[10px] text-emerald-400 font-normal">Check ✓ to mark complete</span>
              </div>

              {/* Set Rows Header */}
              <div className="grid grid-cols-12 gap-1.5 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider px-2 py-1 bg-[#0b0b0e] rounded-lg border border-zinc-800/60">
                <span className="col-span-1 text-center">SET</span>
                <span className="col-span-3 text-center">KG</span>
                <span className="col-span-3 text-center">REPS</span>
                <span className="col-span-3 text-center">RIR</span>
                <span className="col-span-2 text-center">DONE</span>
              </div>

              {/* Set Rows List */}
              <div className="space-y-2">
                {draftSets.map((row) => {
                  const isComplete = row.completed;

                  return (
                    <div
                      key={row.id}
                      className={`grid grid-cols-12 gap-1.5 items-center p-2 rounded-xl border transition ${
                        isComplete
                          ? "bg-emerald-950/30 border-emerald-700/60 text-emerald-300 shadow-sm"
                          : "bg-[#0b0b0e] border-zinc-800 text-white"
                      }`}
                    >
                      {/* Set Number */}
                      <div className="col-span-1 text-center text-xs font-black">
                        {row.setNum}
                      </div>

                      {/* Weight Input */}
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={row.weightKg}
                          onChange={(e) => handleUpdateDraftRow(row.id, "weightKg", e.target.value)}
                          className={`w-full text-center rounded-lg px-1.5 py-1.5 text-xs font-bold transition focus:outline-none ${
                            isComplete
                              ? "bg-emerald-900/40 border border-emerald-700/50 text-white"
                              : "bg-[#121216] border border-zinc-800 text-white focus:border-[#ff334b]"
                          }`}
                        />
                      </div>

                      {/* Reps Input */}
                      <div className="col-span-3">
                        <input
                          type="number"
                          min="1"
                          value={row.reps}
                          onChange={(e) => handleUpdateDraftRow(row.id, "reps", e.target.value)}
                          className={`w-full text-center rounded-lg px-1.5 py-1.5 text-xs font-bold transition focus:outline-none ${
                            isComplete
                              ? "bg-emerald-900/40 border border-emerald-700/50 text-white"
                              : "bg-[#121216] border border-zinc-800 text-white focus:border-[#ff334b]"
                          }`}
                        />
                      </div>

                      {/* RIR Dropdown */}
                      <div className="col-span-3">
                        <select
                          value={row.rir}
                          onChange={(e) => handleUpdateDraftRow(row.id, "rir", e.target.value)}
                          className={`w-full text-center rounded-lg px-1 py-1.5 text-[10px] font-semibold transition focus:outline-none ${
                            isComplete
                              ? "bg-emerald-900/40 border border-emerald-700/50 text-emerald-200"
                              : "bg-[#121216] border border-zinc-800 text-zinc-300 focus:border-[#ff334b]"
                          }`}
                        >
                          {RIR_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Completion Check & Delete Actions */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(row.id)}
                          className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center transition active:scale-90 border ${
                            isComplete
                              ? "bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/20"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                          }`}
                          title={isComplete ? "Mark incomplete" : "Mark completed"}
                        >
                          {isComplete ? "✓" : "○"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteDraftSet(row.id)}
                          className="p-1 text-[10px] text-zinc-500 hover:text-red-400 transition"
                          title="Delete set row"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Set Button */}
              <button
                type="button"
                onClick={handleAddDraftSet}
                className="w-full py-2.5 bg-[#0b0b0e] hover:bg-zinc-800/80 text-zinc-300 hover:text-white font-bold text-xs rounded-xl transition border border-dashed border-zinc-800 hover:border-zinc-700 flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <span>➕ Add Set</span>
              </button>
            </div>

            {/* Human Limit Validation Error Banner */}
            {isDraftWeightExceeded && (
              <div className="p-3.5 rounded-xl text-xs font-bold border bg-red-950/40 border-red-600/80 text-rose-400 shadow-sm animate-pulse flex items-center gap-2">
                <span>🛑</span>
                <span>
                  {sarcasticRoast || "Weight exceeds realistic human limits for this lift."} ({liftType} max limit: {maxAllowedLimit} kg)
                </span>
              </div>
            )}

            {/* Submit Workout Button */}
            <form onSubmit={handleFinishWorkout} className="pt-2">
              <button
                type="submit"
                disabled={saving || loading || isDraftWeightExceeded}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition shadow-lg shadow-emerald-950/30 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <span>{saving ? "Saving Workout..." : `Finish Workout (${draftSets.filter((r) => r.completed).length} Sets)`}</span>
                <span>✓</span>
              </button>
            </form>
          </div>
        )}

        {/* Grouped Session History View */}
        <div className={readOnly ? "p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-4" : "lg:col-span-2 p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-4"}>
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>🗓️</span> Workout Sessions ({sessionGroups.length} Sessions)
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Saved set entries grouped by Workout Date and Exercise
              </p>
            </div>
          </div>

          <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
            {sessionGroups.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                No session logs match your selected filter. Log your first powerlifting workout set!
              </div>
            ) : (
              sessionGroups.map((group) => {
                const colorConfig = LIFT_COLORS[group.liftType] || LIFT_COLORS.Squat;

                const totalSessionSets = group.items.length;
                const peakWeight = Math.max(...group.items.map((i) => i.weight_kg));
                const sessionVolume = group.items.reduce((acc, i) => acc + i.weight_kg * (i.sets || 1) * i.reps, 0);
                const lastItem = group.items[group.items.length - 1];

                const isToday = group.dateStr === new Date().toISOString().split("T")[0];

                return (
                  <div
                    key={group.key}
                    className="p-4 rounded-xl bg-[#0b0b0e] border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-3 shadow-md"
                  >
                    {/* Session Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{colorConfig.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">{group.liftType} Session</span>
                            {isToday && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                Today
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-medium">
                            {new Date(group.dateStr).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Session Summary Pills & Quick Pre-fill Button */}
                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                          <span>Peak: <strong className="text-white">{peakWeight} kg</strong></span>
                          <span>•</span>
                          <span>Vol: <strong className="text-cyan-400">{sessionVolume.toLocaleString()} kg</strong></span>
                          <span>•</span>
                          <span><strong className="text-rose-400">{totalSessionSets} sets</strong></span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleQuickAddSessionSet(group.liftType, group.dateStr, lastItem.weight_kg, lastItem.reps)}
                          className="px-2.5 py-1 bg-[#ff334b]/20 hover:bg-[#ff334b] text-[#ff334b] hover:text-white font-bold text-xs rounded-lg transition border border-[#ff334b]/30 flex items-center gap-1 shadow-sm active:scale-95"
                          title="Pre-fill logger with this exercise & date"
                        >
                          <span>+ Load Session</span>
                        </button>
                      </div>
                    </div>

                    {/* Set Rows Table in History */}
                    <div className="space-y-2">
                      {group.items.map((log, index) => {
                        const isEditing = editingId === log.id;
                        const est1RM = Math.round(log.weight_kg * (1 + log.reps / 30));

                        return (
                          <div
                            key={log.id}
                            className="p-3 rounded-lg bg-[#121216] border border-zinc-800/60 flex flex-col gap-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              {isEditing ? (
                                <div className="space-y-2 w-full">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-zinc-500 font-bold">Set {index + 1}:</span>
                                    <input
                                      type="number"
                                      value={editWeight}
                                      onChange={(e) => setEditWeight(Number(e.target.value))}
                                      className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-bold"
                                    />
                                    <span className="text-xs text-zinc-500">kg ×</span>
                                    <input
                                      type="number"
                                      value={editReps}
                                      onChange={(e) => setEditReps(Number(e.target.value))}
                                      className="w-12 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                    <span className="text-xs text-zinc-500">reps</span>
                                  </div>

                                  <div className="flex flex-wrap gap-1 pt-1">
                                    {PREDEFINED_TAGS.map((t) => (
                                      <button
                                        key={t}
                                        type="button"
                                        onClick={() => toggleTag(t, editTags, setEditTags)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                          editTags.includes(t)
                                            ? "bg-rose-500 text-white border-rose-500"
                                            : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                        }`}
                                      >
                                        {t}
                                      </button>
                                    ))}
                                  </div>

                                  <input
                                    type="text"
                                    placeholder="Edit notes..."
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                                  />
                                </div>
                              ) : (
                                <div className="space-y-1.5 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                      Set {index + 1}
                                    </span>
                                    <span className="text-sm font-black text-white">{log.weight_kg} kg</span>
                                    <span className="text-xs font-semibold text-zinc-300">
                                      × {log.reps} reps
                                    </span>
                                    <span className="text-[10px] text-rose-400 font-bold px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                                      Est. 1RM ~{est1RM}kg
                                    </span>
                                  </div>

                                  {/* Tag Pill Badges */}
                                  {log.tags && log.tags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                      {log.tags.map((tag) => (
                                        <span
                                          key={tag}
                                          className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/80"
                                        >
                                          🏷️ {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Notes Text */}
                                  {log.notes && (
                                    <div className="text-xs text-zinc-400 italic bg-[#0b0b0e] p-2 rounded-lg border border-zinc-800/80 mt-1">
                                      "{log.notes}"
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Edit & Delete Action Buttons */}
                              <div className="flex items-center gap-1.5 self-start">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(log.id)}
                                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingId(null)}
                                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded transition"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingId(log.id);
                                        setEditWeight(log.weight_kg);
                                        setEditSets(log.sets || 1);
                                        setEditReps(log.reps);
                                        setEditNotes(log.notes || "");
                                        setEditTags(log.tags || []);
                                      }}
                                      className="p-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition"
                                      title="Edit set entry"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLog(log.id)}
                                      className="p-1 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition"
                                      title="Delete set entry"
                                    >
                                      🗑️
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Dual Axis Progress Visualization */}
      <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>📈</span> Strength Progression & Body Weight Overlay
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Monitor compound strength retention against body weight changes over time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-[#0b0b0e] p-1 rounded-xl border border-zinc-800">
              {(["1M", "3M", "6M", "1Y", "ALL"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTimeRange(r)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    timeRange === r ? "bg-[#ff334b] text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowBodyWeightOverlay(!showBodyWeightOverlay)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                showBodyWeightOverlay
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              }`}
            >
              <span>⚖️</span> Body Weight Overlay
            </button>

            <button
              type="button"
              onClick={handleExportChart}
              disabled={exporting || loading}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 no-export"
              title="Export chart as PNG image"
            >
              <span>📸</span>
              <span>{exporting ? "Exporting..." : "Export Image"}</span>
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff334b]" />
            <span className="text-zinc-300 font-semibold">
              Lifting Weight ({selectedLiftFilter})
            </span>
          </div>

          {showBodyWeightOverlay && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="text-zinc-300 font-semibold">
                Body Weight Trend (`weight_logs`)
              </span>
            </div>
          )}
        </div>

        {/* Chart Visualization */}
        {loading ? (
          <div className="h-52 bg-[#0b0b0e] rounded-xl animate-pulse flex items-center justify-center text-zinc-600 text-xs">
            Loading chart visualization...
          </div>
        ) : (
          <div ref={strengthChartRef} className="relative bg-[#0b0b0e] border border-zinc-800/80 rounded-xl p-5 overflow-hidden space-y-3">
            {/* Branded Watermark Header for Image Export */}
            <div className="flex items-center justify-between text-xs border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#ff334b] text-white font-black text-[10px] flex items-center justify-center">R</span>
                <span className="font-extrabold text-white tracking-wider text-xs">RYVOM APP • POWERLIFTING & STRENGTH PROGRESSION</span>
              </div>
              <span className="text-[10px] font-bold text-rose-400">
                Peak: {stats.maxWeight} kg | 1RM ~{stats.bestEst1RM} kg
              </span>
            </div>

            <svg viewBox="0 0 300 150" className="w-full h-52 overflow-visible">
              <defs>
                <linearGradient id="liftGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff334b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#ff334b" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              <line x1="0" y1="30" x2="300" y2="30" stroke="#1f1f26" strokeDasharray="3 3" />
              <line x1="0" y1="75" x2="300" y2="75" stroke="#1f1f26" strokeDasharray="3 3" />
              <line x1="0" y1="120" x2="300" y2="120" stroke="#1f1f26" strokeDasharray="3 3" />

              {showBodyWeightOverlay && svgBWPath && (
                <g>
                  <path
                    d={svgBWPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                  {chartData.bodyWeightPoints.map((p) => (
                    <circle
                      key={`bw-${p.id}`}
                      cx={p.xPercent * 3}
                      cy={p.yPercent * 1.5}
                      r="3"
                      fill="#f59e0b"
                    />
                  ))}
                </g>
              )}

              {svgLiftPath && (
                <path
                  d={svgLiftPath}
                  fill="none"
                  stroke="#ff334b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {chartData.liftPoints.map((p) => (
                <g key={`lift-${p.id}`} className="group cursor-pointer">
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

            <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium">
              <span>{chartData.liftPoints[0]?.formattedDate || ""}</span>
              <span>
                {chartData.liftPoints[Math.floor(chartData.liftPoints.length / 2)]?.formattedDate || ""}
              </span>
              <span>{chartData.liftPoints[chartData.liftPoints.length - 1]?.formattedDate || ""}</span>
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

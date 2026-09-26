"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Edit3,
  Archive,
  RotateCcw,
  Link2,
  TrendingUp,
  Calendar,
  Camera,
  Dumbbell,
  FileText,
  Activity,
  Plus,
  Lock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import PhotoUploader from "@/components/PhotoUploader";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import { LoadingState } from "@/components/EmptyState";
import DateRangeSelector from "@/components/progress/DateRangeSelector";
import ProgressSummaryCards from "@/components/progress/ProgressSummaryCards";
import InteractiveChart from "@/components/progress/InteractiveChart";
import PeriodComparisonView from "@/components/progress/PeriodComparisonView";

// Dynamically import heavy tab-specific components and modals to code-split bundles
const PerformanceTracker = dynamic(
  () => import("@/components/progress/PerformanceTracker"),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-zinc-900/50 animate-pulse" /> }
);
const PhotoCompareView = dynamic(
  () => import("@/components/progress/PhotoCompareView"),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-zinc-900/50 animate-pulse" /> }
);
const CoachNotesTimeline = dynamic(
  () => import("@/components/progress/CoachNotesTimeline"),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-zinc-900/50 animate-pulse" /> }
);
const ReportGeneratorModal = dynamic(
  () => import("@/components/progress/ReportGeneratorModal"),
  { ssr: false }
);
import {
  computeMetricSummary,
  filterCheckInsByRange,
  sortCheckInsChronologically,
  formatNum,
  computePerformancePRs,
} from "@/lib/progressAnalytics";
import { isSignedPhotoUrl } from "@/lib/photoStorage";
import type {
  Client,
  CheckIn,
  CoachReview,
  PerformanceWithLogs,
  CoachTimelineNote,
  DateRangePreset,
  MetricType,
} from "@/lib/types";

interface ClientData {
  client: Client;
  checkins: CheckIn[];
  reviews: CoachReview[];
  hasActiveLink: boolean;
}

interface ClientProfilePageProps {
  initialTab?: "overview" | "checkins" | "progress" | "performance" | "photos" | "coach_notes";
}

export default function ClientProfilePage({
  initialTab = "progress",
}: ClientProfilePageProps) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClientData | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceWithLogs[]>([]);
  const [coachNotes, setCoachNotes] = useState<CoachTimelineNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 6 Primary Tabs
  const [activeTab, setActiveTab] = useState<
    "overview" | "checkins" | "progress" | "performance" | "photos" | "coach_notes"
  >(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search).get("tab");
      const valid = ["overview", "checkins", "progress", "performance", "photos", "coach_notes"];
      if (sp && valid.includes(sp)) {
        return sp as "overview" | "checkins" | "progress" | "performance" | "photos" | "coach_notes";
      }
    }
    return initialTab;
  });

  // Date range filtering
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("8w");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Modals & Forms
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showManualCheckinModal, setShowManualCheckinModal] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check-in & Review state
  const [expandedCheckin, setExpandedCheckin] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({
    wins: "",
    issues: "",
    adjustments: "",
    next_week_goals: "",
    coach_notes: "",
  });
  const [reviewLoading, setReviewLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  const notify = (message: string, type: "error" | "success" = "error") => {
    setActionFeedback({ message, type });
    setTimeout(() => {
      setActionFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Manual Check-in Form state
  const [manualCheckin, setManualCheckin] = useState({
    week_ending: new Date().toISOString().split("T")[0],
    weight: "",
    average_weight: "",
    waist_cm: "",
    diet_adherence: "90",
    training_adherence: "90",
    average_steps: "8000",
    sleep_hours: "7.5",
    hunger: "5",
    energy: "7",
    stress: "4",
    client_notes: "",
    photo_front_url: "",
    photo_side_url: "",
    photo_back_url: "",
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [photosSigned, setPhotosSigned] = useState(false);
  const photosSignedRef = useRef(photosSigned);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    photosSignedRef.current = photosSigned;
  }, [photosSigned]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // On-demand photo URL resolution: only resolve when the Photos tab is opened
  useEffect(() => {
    if (activeTab === "photos" && !photosSigned && id && id !== "undefined") {
      void fetch(`/api/clients/${id}?photos=true`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.checkins) {
            setData((prev) => (prev ? { ...prev, checkins: d.checkins } : prev));
            setPhotosSigned(true);
          }
        })
        .catch(() => {});
    }
  }, [activeTab, photosSigned, id]);

  const loadData = useCallback(async () => {
    if (!id || id === "undefined") {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // If already on the photos tab, request signed photo URLs directly in the initial request
      const fetchPhotos = activeTabRef.current === "photos" || photosSignedRef.current;
      const res = await fetch(`/api/clients/${id}${fetchPhotos ? "?photos=true" : ""}`);
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const errJson = await res.json().catch(() => ({}));
        const errorMsg =
          errJson.error ||
          (res.status === 404
            ? "Client not found or does not belong to your account."
            : res.status === 403
            ? "Access denied. You do not have permission to view this client."
            : res.status === 400
            ? "Invalid client ID."
            : `Server error (${res.status}) while loading client.`);
        throw new Error(errorMsg);
      }
      const json = await res.json();
      if (fetchPhotos) {
        setPhotosSigned(true);
      }
      setData((prev) => {
        // If photos were previously signed in state but this fetch did not request photos, preserve signed checkins
        if (!fetchPhotos && photosSignedRef.current && prev?.checkins) {
          return {
            ...json,
            checkins: prev.checkins,
          };
        }
        return json;
      });

      // 1. If consolidated metrics and notes were returned in the initial payload, use them immediately
      if (Array.isArray(json.metrics) && Array.isArray(json.coachNotes)) {
        setPerformanceMetrics(json.metrics.map(computePerformancePRs));
        setCoachNotes(json.coachNotes);
      } else {
        // 2. Fallback: Fetch performance metrics and coach notes in PARALLEL
        const [perfRes, notesRes] = await Promise.all([
          fetch(`/api/clients/${id}/performance`),
          fetch(`/api/clients/${id}/coach-notes`),
        ]);

        if (perfRes.ok) {
          const perfJson = await perfRes.json();
          const computed = (perfJson.metrics || []).map(computePerformancePRs);
          setPerformanceMetrics(computed);
        }

        if (notesRes.ok) {
          const notesJson = await notesRes.json();
          setCoachNotes(notesJson.notes || []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id && id !== "undefined") {
      void loadData();
    }
  }, [id, loadData]);

  // Performance Metric Handlers
  const handleAddMetric = async (metricData: {
    name: string;
    unit: string;
    metric_type: MetricType;
    target_value: number | null;
    track_on_checkin: boolean;
    show_on_dashboard: boolean;
  }) => {
    const res = await fetch(`/api/clients/${id}/performance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metricData),
    });
    if (!res.ok) throw new Error("Failed to add metric");
    await loadData();
  };

  const handleLogPerformance = async (
    metricId: string,
    logData: { logged_date: string; value: number; notes?: string }
  ) => {
    const res = await fetch(`/api/clients/${id}/performance/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metric_id: metricId, ...logData }),
    });
    if (!res.ok) throw new Error("Failed to log performance");
    await loadData();
  };

  const handleDeleteMetric = async (metricId: string) => {
    const res = await fetch(`/api/clients/${id}/performance/${metricId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete metric");
    await loadData();
  };

  const handleDeleteLog = async (logId: string) => {
    const res = await fetch(`/api/clients/${id}/performance/log?logId=${logId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete performance log");
    notify("Performance entry deleted", "success");
    await loadData();
  };

  // Coach Note Handlers
  const handleAddCoachNote = async (noteData: {
    note_date: string;
    note: string;
    category?: string;
  }) => {
    const res = await fetch(`/api/clients/${id}/coach-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(noteData),
    });
    if (!res.ok) throw new Error("Failed to add coach note");
    await loadData();
  };

  const handleDeleteCoachNote = async (noteId: string) => {
    const res = await fetch(`/api/clients/${id}/coach-notes/${noteId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete coach note");
    await loadData();
  };

  // Manual Check-in Handler
  const handleManualCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${id}/checkins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_ending: manualCheckin.week_ending,
          weight: manualCheckin.weight ? parseFloat(manualCheckin.weight) : null,
          average_weight: manualCheckin.average_weight
            ? parseFloat(manualCheckin.average_weight)
            : null,
          waist_cm: manualCheckin.waist_cm ? parseFloat(manualCheckin.waist_cm) : null,
          diet_adherence: manualCheckin.diet_adherence
            ? parseFloat(manualCheckin.diet_adherence)
            : null,
          training_adherence: manualCheckin.training_adherence
            ? parseFloat(manualCheckin.training_adherence)
            : null,
          average_steps: manualCheckin.average_steps
            ? parseInt(manualCheckin.average_steps)
            : null,
          sleep_hours: manualCheckin.sleep_hours
            ? parseFloat(manualCheckin.sleep_hours)
            : null,
          hunger: manualCheckin.hunger ? parseInt(manualCheckin.hunger) : null,
          energy: manualCheckin.energy ? parseInt(manualCheckin.energy) : null,
          stress: manualCheckin.stress ? parseInt(manualCheckin.stress) : null,
          client_notes: manualCheckin.client_notes || null,
          photo_front_url: manualCheckin.photo_front_url || null,
          photo_side_url: manualCheckin.photo_side_url || null,
          photo_back_url: manualCheckin.photo_back_url || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed to save check-in");
      }
      setShowManualCheckinModal(false);
      notify("Check-in submitted successfully!", "success");
      await loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to submit check-in", "error");
    } finally {
      setManualSubmitting(false);
    }
  };

  // Client Details Edit Handler
  async function handleEdit() {
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editForm.full_name,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          goal: editForm.goal || undefined,
          starting_weight: editForm.starting_weight
            ? parseFloat(editForm.starting_weight)
            : undefined,
          target_weight: editForm.target_weight
            ? parseFloat(editForm.target_weight)
            : undefined,
          target_date: editForm.target_date || undefined,
          notes: editForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update client");
      }
      setShowEditModal(false);
      notify("Client profile updated successfully", "success");
      await loadData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update client");
    } finally {
      setEditLoading(false);
    }
  }

  // Invite Link Generator
  async function handleGenerateInvite() {
    setInviteLoading(true);
    try {
      const res = await fetch("/api/clients/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: id }),
      });
      if (!res.ok) throw new Error("Failed to generate invite");
      const json = await res.json();
      setInviteUrl(json.url);
      setData((prev) => (prev ? { ...prev, hasActiveLink: true } : prev));
      notify("New invite link generated", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to generate invite", "error");
    } finally {
      setInviteLoading(false);
    }
  }

  // Archive / Restore Handler
  async function handleToggleArchive() {
    if (!data) return;
    try {
      const newStatus = !data.client.active;
      await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newStatus }),
      });
      notify(newStatus ? "Client restored to active list" : "Client archived", "success");
      await loadData();
    } catch {
      notify("Failed to update client status", "error");
    }
  }

  // Delete Handler
  async function handleDelete() {
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete client");
      router.push("/");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete client", "error");
    }
  }

  // Save Coach Review
  async function handleSaveReview(checkinId: string) {
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/clients/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_in_id: checkinId, ...reviewForm }),
      });
      if (!res.ok) throw new Error("Failed to save review");
      notify("Check-in review saved successfully!", "success");
      await loadData();
    } catch {
      notify("Failed to save review", "error");
    } finally {
      setReviewLoading(false);
    }
  }

  const client = data?.client;
  const checkins = useMemo(() => data?.checkins || [], [data?.checkins]);
  const reviews = useMemo(() => data?.reviews || [], [data?.reviews]);

  const sortedCheckIns = useMemo(() => {
    return sortCheckInsChronologically(checkins);
  }, [checkins]);

  const filteredCheckIns = useMemo(() => {
    return filterCheckInsByRange(
      sortedCheckIns,
      dateRangePreset,
      customStart,
      customEnd
    );
  }, [sortedCheckIns, dateRangePreset, customStart, customEnd]);

  // Map reviews by check-in ID
  const reviewMap = useMemo(() => {
    const map: Record<string, CoachReview> = {};
    for (const r of reviews) {
      map[r.check_in_id] = r;
    }
    return map;
  }, [reviews]);

  // Memoize high-level progress summaries so re-renders don't recompute
  const {
    weightSummary,
    waistSummary,
    dietSummary,
    trainingSummary,
    stepsSummary,
    sleepSummary,
  } = useMemo(() => ({
    weightSummary: computeMetricSummary(filteredCheckIns, "weight"),
    waistSummary: computeMetricSummary(filteredCheckIns, "waist_cm"),
    dietSummary: computeMetricSummary(filteredCheckIns, "diet_adherence"),
    trainingSummary: computeMetricSummary(filteredCheckIns, "training_adherence"),
    stepsSummary: computeMetricSummary(filteredCheckIns, "average_steps"),
    sleepSummary: computeMetricSummary(filteredCheckIns, "sleep_hours"),
  }), [filteredCheckIns]);

  // Determine starting weight and current weight
  const startingWeight = client?.starting_weight ?? weightSummary.first;
  const currentWeight = weightSummary.latest ?? startingWeight;
  const latestCheckin = checkins.length > 0 ? checkins[0] : null;

  if (!id || id === "undefined" || loading) {
    return (
      <div className="flex min-h-screen bg-[#09090b] text-white">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          <main className="flex-1 p-8 flex items-center justify-center">
            <LoadingState message="Loading client profile..." />
          </main>
        </div>
      </div>
    );
  }

  if (error || !data || !client) {
    return (
      <div className="flex min-h-screen bg-[#09090b] text-white">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          <main className="flex-1 p-8 flex items-center justify-center">
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md">
              <div className="mb-4 text-red-400">
                <AlertCircle size={48} strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-zinc-200 mb-2">
                {error || "Could not load client profile"}
              </h3>
              <p className="text-xs text-zinc-400 mb-6">
                Please verify the client ID, network connection, or your account permissions.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { void loadData(); }}
                  className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Try again
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {actionFeedback && (
            <div
              className={`flex items-center justify-between gap-2.5 p-3.5 rounded-xl border text-xs font-semibold shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
                actionFeedback.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {actionFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{actionFeedback.message}</span>
              </div>
              <button
                onClick={() => setActionFeedback(null)}
                className="text-zinc-500 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* ─── LEVEL 1: CLIENT IDENTITY & PRIMARY ACTIONS ─── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
            <div className="flex items-center gap-3.5 pl-10 lg:pl-0">
              <button
                onClick={() => router.push("/")}
                aria-label="Back to dashboard"
                title="Back to Dashboard"
                className="p-2.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800/80 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                    {client.full_name}
                  </h1>
                  {client.is_self && (
                    <span className="text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      My Profile
                    </span>
                  )}
                  {!client.active && (
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-medium border border-zinc-700">
                      Archived
                    </span>
                  )}
                  {latestCheckin ? (
                    <StatusBadge status={latestCheckin.status} />
                  ) : (
                    <span className="text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 font-medium">
                      No Check-ins
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2 flex-wrap">
                  <span>{client.goal || "Goal not set"}</span>
                  {client.target_weight && (
                    <>
                      <span className="text-zinc-600">&bull;</span>
                      <span>Target: {client.target_weight} kg</span>
                    </>
                  )}
                  <span className="text-zinc-600">&bull;</span>
                  <span>{checkins.length} {checkins.length === 1 ? "check-in recorded" : "check-ins recorded"}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:justify-end pl-10 md:pl-0">
              {/* Primary CTA */}
              <button
                onClick={() => setShowManualCheckinModal(true)}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-amber-400/20"
              >
                <Plus className="w-4 h-4" />
                <span>Log Check-in</span>
              </button>

              {/* Secondary CTAs */}
              <button
                onClick={() => setShowReportModal(true)}
                className="px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>Export & Reports</span>
              </button>

              {!client.is_self && (
                <button
                  onClick={handleGenerateInvite}
                  disabled={inviteLoading}
                  className="px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Link2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{data.hasActiveLink ? "Copy Portal Link" : "Invite Link"}</span>
                </button>
              )}

              {/* Edit Profile Button */}
              <button
                onClick={() => {
                  setEditForm({
                    full_name: client.full_name || "",
                    email: client.email || "",
                    phone: client.phone || "",
                    goal: client.goal || "",
                    starting_weight: client.starting_weight?.toString() || "",
                    target_weight: client.target_weight?.toString() || "",
                    target_date: client.target_date || "",
                    notes: client.notes || "",
                  });
                  setShowEditModal(true);
                }}
                aria-label="Edit client profile"
                title="Edit Profile"
                className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
              </button>

              {/* Archive / Restore Button */}
              {!client.is_self && (
                <button
                  onClick={handleToggleArchive}
                  aria-label={client.active ? "Archive client" : "Restore client"}
                  title={client.active ? "Archive Client" : "Restore Client"}
                  className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition-colors cursor-pointer"
                >
                  {client.active ? (
                    <Archive className="w-4 h-4" />
                  ) : (
                    <RotateCcw className="w-4 h-4 text-emerald-400" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Portal Link Alert (if recently generated) */}
          {inviteUrl && (
            <div className="bg-zinc-900 border border-amber-400/40 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="truncate">
                <span className="font-semibold text-amber-400 block mb-0.5">
                  Client Portal Link Active
                </span>
                <span className="text-zinc-400 font-mono truncate block">{inviteUrl}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Link"}
              </button>
            </div>
          )}

          {/* ─── LEVEL 2: 6 PRIMARY TABS NAVIGATION ─── */}
          <div className="flex border-b border-zinc-800/80 overflow-x-auto scrollbar-none gap-1 bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/60">
            {([
              { id: "progress", label: "Progress", icon: TrendingUp, badge: 0 },
              { id: "performance", label: "Performance", icon: Dumbbell, badge: 0 },
              { id: "photos", label: "Photos", icon: Camera, badge: 0 },
              { id: "checkins", label: "Check-ins", icon: Activity, badge: checkins.filter((c) => c.status === "pending").length },
              { id: "coach_notes", label: "Coach Notes", icon: Lock, badge: 0 },
              { id: "overview", label: "Overview", icon: Calendar, badge: 0 },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-3.5 text-xs font-semibold flex items-center gap-2 rounded-lg transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
                    isActive
                      ? "bg-zinc-800 text-white shadow-xs border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-zinc-400"}`} />
                  <span>{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className="bg-amber-400/20 text-amber-400 border border-amber-400/30 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ══════════════════════════════════════════════════════════
              TAB 1: PROGRESS (First-Class Feature)
             ══════════════════════════════════════════════════════════ */}
          {activeTab === "progress" && (
            <div className="space-y-6">
              {/* Level 3: Global Date Range Filter */}
              <DateRangeSelector
                preset={dateRangePreset}
                onPresetChange={setDateRangePreset}
                startDate={customStart}
                endDate={customEnd}
                onCustomDatesChange={(s, e) => {
                  setCustomStart(s);
                  setCustomEnd(e);
                }}
              />

              {/* Level 4: Top Visual Progress Summary Grid */}
              <ProgressSummaryCards
                startingWeight={startingWeight}
                currentWeight={currentWeight}
                targetWeight={client.target_weight}
                startingWaist={waistSummary.first}
                currentWaist={waistSummary.latest}
                avgDiet={dietSummary.average}
                avgTraining={trainingSummary.average}
                avgSteps={stepsSummary.average}
                avgSleep={sleepSummary.average}
                completedCheckins={checkins.filter((c) => c.status === "reviewed").length}
                missedCheckins={checkins.filter((c) => c.status === "pending").length}
                performanceMetrics={performanceMetrics}
              />

              {/* Level 5: Primary & Secondary Interactive Analytics Charts */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Weight Graph */}
                  <InteractiveChart
                    title="Bodyweight Trend"
                    subtitle="Weekly check-in average"
                    clientName={client.full_name}
                    data={filteredCheckIns.map((c) => ({
                      date: c.week_ending,
                      formattedDate: new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                      value: c.weight,
                      avgValue: c.average_weight,
                    }))}
                    unit=" kg"
                    color="#f59e0b"
                    showAverage={true}
                    targetValue={client.target_weight}
                    emptyMessage="No bodyweight records in the selected date range."
                    onActionClick={() => setShowManualCheckinModal(true)}
                    actionLabel="Log Check-in"
                  />

                  {/* Waist Graph */}
                  <InteractiveChart
                    title="Waist Measurement"
                    subtitle="Waist circumference over time"
                    clientName={client.full_name}
                    data={filteredCheckIns.map((c) => ({
                      date: c.week_ending,
                      formattedDate: new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                      value: c.waist_cm,
                    }))}
                    unit=" cm"
                    color="#06b6d4"
                    emptyMessage="No waist records in the selected date range."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Diet Adherence */}
                  <InteractiveChart
                    title="Diet Adherence"
                    subtitle="Nutrition target"
                    clientName={client.full_name}
                    data={filteredCheckIns.map((c) => ({
                      date: c.week_ending,
                      formattedDate: new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                      value: c.diet_adherence,
                    }))}
                    unit="%"
                    color="#10b981"
                    minDomain={0}
                    maxDomain={100}
                    emptyMessage="No diet adherence data."
                  />

                  {/* Training Adherence */}
                  <InteractiveChart
                    title="Training Adherence"
                    subtitle="Workout program"
                    clientName={client.full_name}
                    data={filteredCheckIns.map((c) => ({
                      date: c.week_ending,
                      formattedDate: new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                      value: c.training_adherence,
                    }))}
                    unit="%"
                    color="#8b5cf6"
                    minDomain={0}
                    maxDomain={100}
                    emptyMessage="No training adherence data."
                  />

                  {/* Steps */}
                  <InteractiveChart
                    title="Daily Steps"
                    subtitle="Activity volume"
                    clientName={client.full_name}
                    data={filteredCheckIns.map((c) => ({
                      date: c.week_ending,
                      formattedDate: new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                      value: c.average_steps,
                    }))}
                    unit=" st"
                    color="#3b82f6"
                    emptyMessage="No step counts recorded."
                  />

                  {/* Sleep */}
                  <InteractiveChart
                    title="Average Sleep"
                    subtitle="Recovery duration"
                    clientName={client.full_name}
                    data={filteredCheckIns.map((c) => ({
                      date: c.week_ending,
                      formattedDate: new Date(c.week_ending).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                      value: c.sleep_hours,
                    }))}
                    unit=" h"
                    color="#ec4899"
                    emptyMessage="No sleep hours logged."
                  />
                </div>
              </div>

              {/* Level 6: Period Comparison Section */}
              <PeriodComparisonView checkIns={sortedCheckIns} />
            </div>
          )}

        {/* ══════════════════════════════════════════════════════════
            TAB 2: PERFORMANCE TRACKING
           ══════════════════════════════════════════════════════════ */}
        {activeTab === "performance" && (
          <PerformanceTracker
            clientId={id}
            metrics={performanceMetrics}
            onAddMetric={handleAddMetric}
            onLogPerformance={handleLogPerformance}
            onDeleteMetric={handleDeleteMetric}
            onDeleteLog={handleDeleteLog}
          />
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 3: PHOTOS & COMPARISON
           ══════════════════════════════════════════════════════════ */}
        {activeTab === "photos" && (
          <PhotoCompareView checkIns={sortedCheckIns} />
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 4: CHECK-INS TIMELINE & REVIEWS
           ══════════════════════════════════════════════════════════ */}
        {activeTab === "checkins" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 p-3.5 rounded-xl">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Check-in Timeline ({checkins.length} Total)
              </span>
              <button
                onClick={() => setShowManualCheckinModal(true)}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Check-in
              </button>
            </div>

            {checkins.length === 0 ? (
              <div className="bg-zinc-900/80 border border-zinc-800 p-8 rounded-xl text-center">
                <Activity className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-white">No check-ins yet</h4>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  Clients submit check-ins via their portal link, or you can record one directly using the &ldquo;Add Check-in&rdquo; button.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {checkins.map((c) => {
                  const review = reviewMap[c.id];
                  const isExpanded = expandedCheckin === c.id;

                  return (
                    <div
                      key={c.id}
                      className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl overflow-hidden transition-all"
                    >
                      {/* Check-in Row Header */}
                      <div
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedCheckin(null);
                          } else {
                            setExpandedCheckin(c.id);
                            setReviewForm({
                              wins: review?.wins || "",
                              issues: review?.issues || "",
                              adjustments: review?.adjustments || "",
                              next_week_goals: review?.next_week_goals || "",
                              coach_notes: review?.coach_notes || "",
                            });
                          }
                        }}
                        className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-zinc-800/40"
                      >
                        <div className="flex items-center gap-3">
                          <StatusBadge status={c.status} />
                          <div>
                            <span className="text-sm font-bold text-white block">
                              Week ending{" "}
                              {new Date(c.week_ending).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <span className="text-xs text-zinc-400">
                              Weight:{" "}
                              <strong className="text-amber-400">
                                {formatNum(c.weight, 1, "", " kg")}
                              </strong>{" "}
                              &bull; Waist:{" "}
                              <strong className="text-zinc-300">
                                {formatNum(c.waist_cm, 1, "", " cm")}
                              </strong>{" "}
                              &bull; Diet: {formatNum(c.diet_adherence, 0, "", "%")}{" "}
                              &bull; Training: {formatNum(c.training_adherence, 0, "", "%")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {c.client_notes && (
                            <span className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded max-w-xs truncate hidden sm:block">
                              &ldquo;{c.client_notes}&rdquo;
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Details & Review Section */}
                      {isExpanded && (
                        <div className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-950/60">
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                            <div className="bg-zinc-900 p-2.5 rounded-lg">
                              <span className="text-zinc-500 block text-[10px]">Average Steps</span>
                              <span className="font-bold text-white text-sm">
                                {formatNum(c.average_steps, 0)}
                              </span>
                            </div>
                            <div className="bg-zinc-900 p-2.5 rounded-lg">
                              <span className="text-zinc-500 block text-[10px]">Average Sleep</span>
                              <span className="font-bold text-white text-sm">
                                {formatNum(c.sleep_hours, 1, "", " h")}
                              </span>
                            </div>
                            <div className="bg-zinc-900 p-2.5 rounded-lg">
                              <span className="text-zinc-500 block text-[10px]">Hunger (1-10)</span>
                              <span className="font-bold text-white text-sm">
                                {c.hunger ?? "-"}
                              </span>
                            </div>
                            <div className="bg-zinc-900 p-2.5 rounded-lg">
                              <span className="text-zinc-500 block text-[10px]">Energy (1-10)</span>
                              <span className="font-bold text-white text-sm">
                                {c.energy ?? "-"}
                              </span>
                            </div>
                            <div className="bg-zinc-900 p-2.5 rounded-lg">
                              <span className="text-zinc-500 block text-[10px]">Stress (1-10)</span>
                              <span className="font-bold text-white text-sm">
                                {c.stress ?? "-"}
                              </span>
                            </div>
                            <div className="bg-zinc-900 p-2.5 rounded-lg">
                              <span className="text-zinc-500 block text-[10px]">Photos</span>
                              <span className="font-bold text-amber-400 text-sm">
                                {[c.photo_front_url, c.photo_side_url, c.photo_back_url].filter(Boolean).length} uploaded
                              </span>
                            </div>
                          </div>

                          {/* Photos Gallery Preview */}
                          {(c.photo_front_url || c.photo_side_url || c.photo_back_url) && (
                            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
                              <span className="text-[11px] font-semibold text-zinc-400 block mb-2">
                                Progress Photos:
                              </span>
                              <div className="grid grid-cols-3 gap-2">
                                {c.photo_front_url && (
                                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                                    {isSignedPhotoUrl(c.photo_front_url) ? (
                                      <Image
                                        src={c.photo_front_url}
                                        alt="Front"
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setActiveTab("photos")}
                                        className="text-[10px] text-zinc-500 hover:text-amber-400 p-2 flex flex-col items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        <Camera className="w-4 h-4 text-amber-400 opacity-60" />
                                        <span>View Photos</span>
                                      </button>
                                    )}
                                    <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/70 px-1.5 py-0.5 rounded text-zinc-300">
                                      Front
                                    </span>
                                  </div>
                                )}
                                {c.photo_side_url && (
                                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                                    {isSignedPhotoUrl(c.photo_side_url) ? (
                                      <Image
                                        src={c.photo_side_url}
                                        alt="Side"
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setActiveTab("photos")}
                                        className="text-[10px] text-zinc-500 hover:text-amber-400 p-2 flex flex-col items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        <Camera className="w-4 h-4 text-amber-400 opacity-60" />
                                        <span>View Photos</span>
                                      </button>
                                    )}
                                    <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/70 px-1.5 py-0.5 rounded text-zinc-300">
                                      Side
                                    </span>
                                  </div>
                                )}
                                {c.photo_back_url && (
                                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                                    {isSignedPhotoUrl(c.photo_back_url) ? (
                                      <Image
                                        src={c.photo_back_url}
                                        alt="Back"
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setActiveTab("photos")}
                                        className="text-[10px] text-zinc-500 hover:text-amber-400 p-2 flex flex-col items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        <Camera className="w-4 h-4 text-amber-400 opacity-60" />
                                        <span>View Photos</span>
                                      </button>
                                    )}
                                    <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/70 px-1.5 py-0.5 rounded text-zinc-300">
                                      Back
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {c.client_notes && (
                            <div className="bg-zinc-900 p-3 rounded-lg text-xs">
                              <span className="font-semibold text-zinc-400 block mb-1">
                                Client Notes:
                              </span>
                              <p className="text-zinc-200 italic leading-relaxed">
                                &ldquo;{c.client_notes}&rdquo;
                              </p>
                            </div>
                          )}

                          {/* Coach Review Form */}
                          <div className="border-t border-zinc-800 pt-3">
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block mb-3">
                              Coach Review & Feedback
                            </span>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
                              <div>
                                <label className="block text-zinc-400 mb-1 font-medium">
                                  Wins / Successes
                                </label>
                                <textarea
                                  rows={2}
                                  placeholder="Great adherence, hit step target..."
                                  value={reviewForm.wins}
                                  onChange={(e) =>
                                    setReviewForm((prev) => ({
                                      ...prev,
                                      wins: e.target.value,
                                    }))
                                  }
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                                />
                              </div>

                              <div>
                                <label className="block text-zinc-400 mb-1 font-medium">
                                  Issues / Bottlenecks
                                </label>
                                <textarea
                                  rows={2}
                                  placeholder="Sleep dipped midweek, hunger elevated..."
                                  value={reviewForm.issues}
                                  onChange={(e) =>
                                    setReviewForm((prev) => ({
                                      ...prev,
                                      issues: e.target.value,
                                    }))
                                  }
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                                />
                              </div>

                              <div>
                                <label className="block text-zinc-400 mb-1 font-medium">
                                  Adjustments for Next Week
                                </label>
                                <textarea
                                  rows={2}
                                  placeholder="Add 100g carbs on training days, 15m extra sleep buffer..."
                                  value={reviewForm.adjustments}
                                  onChange={(e) =>
                                    setReviewForm((prev) => ({
                                      ...prev,
                                      adjustments: e.target.value,
                                    }))
                                  }
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                                />
                              </div>

                              <div>
                                <label className="block text-zinc-400 mb-1 font-medium">
                                  Next Week Goals
                                </label>
                                <textarea
                                  rows={2}
                                  placeholder="Hit 95% diet adherence, complete all 4 lifts..."
                                  value={reviewForm.next_week_goals}
                                  onChange={(e) =>
                                    setReviewForm((prev) => ({
                                      ...prev,
                                      next_week_goals: e.target.value,
                                    }))
                                  }
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleSaveReview(c.id)}
                                disabled={reviewLoading}
                                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {reviewLoading ? "Saving..." : "Save Coach Review"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 5: COACH PRIVATE NOTES
           ══════════════════════════════════════════════════════════ */}
        {activeTab === "coach_notes" && (
          <CoachNotesTimeline
            clientId={id}
            notes={coachNotes}
            onAddNote={handleAddCoachNote}
            onDeleteNote={handleDeleteCoachNote}
          />
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 6: OVERVIEW & CLIENT DETAILS
           ══════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
                <span className="text-xs text-zinc-500 font-medium block">Starting Weight</span>
                <span className="text-xl font-bold text-white mt-1 block">
                  {formatNum(client.starting_weight, 1, "", " kg")}
                </span>
              </div>
              <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
                <span className="text-xs text-zinc-500 font-medium block">Target Weight</span>
                <span className="text-xl font-bold text-amber-400 mt-1 block">
                  {formatNum(client.target_weight, 1, "", " kg")}
                </span>
              </div>
              <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
                <span className="text-xs text-zinc-500 font-medium block">Target Date</span>
                <span className="text-lg font-bold text-zinc-200 mt-1 block">
                  {client.target_date
                    ? new Date(client.target_date).toLocaleDateString("en-GB")
                    : "Open-ended"}
                </span>
              </div>
              <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
                <span className="text-xs text-zinc-500 font-medium block">Account Created</span>
                <span className="text-lg font-bold text-zinc-200 mt-1 block">
                  {new Date(client.created_at).toLocaleDateString("en-GB")}
                </span>
              </div>
            </div>

            {/* Profile Info & Goals */}
            <div className="bg-zinc-900/90 border border-zinc-800 p-5 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Profile Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block mb-1">Email:</span>
                  <span className="text-zinc-200 font-medium">{client.email || "-"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block mb-1">Phone:</span>
                  <span className="text-zinc-200 font-medium">{client.phone || "-"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block mb-1">Primary Goal:</span>
                  <span className="text-zinc-200 font-medium">{client.goal || "-"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block mb-1">Status:</span>
                  <span className="text-zinc-200 font-medium">
                    {client.active ? "Active Client" : "Archived Client"}
                  </span>
                </div>
              </div>

              {client.notes && (
                <div className="pt-3 border-t border-zinc-800">
                  <span className="text-zinc-500 text-xs block mb-1">General Notes:</span>
                  <p className="text-xs text-zinc-300 leading-relaxed">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Danger Zone */}
            {!client.is_self && (
              <div className="bg-zinc-900/40 border border-rose-950/40 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-rose-400 block">
                    Delete Client Profile
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Permanently delete this client and all associated check-ins and performance data.
                  </span>
                </div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDelete}
                      className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-2 py-1.5 text-xs text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-rose-950/30 text-rose-400 text-xs font-semibold border border-rose-900/40 rounded-lg cursor-pointer"
                  >
                    Delete Client
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Export & PDF Report Generator Modal ─── */}
      <ReportGeneratorModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        client={client}
        checkIns={filteredCheckIns}
        reviews={reviewMap}
        performanceMetrics={performanceMetrics}
        coachNotes={coachNotes}
        dateRangeLabel={dateRangePreset.toUpperCase()}
      />

      {/* ─── Edit Client Modal ─── */}
      {showEditModal && (
        <Modal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit Profile"
        >
          <div className="space-y-4">
            {editError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg">
                {editError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Full Name</label>
              <input
                type="text"
                value={editForm.full_name || ""}
                onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Starting Weight (kg)</label>
                <input
                  type="number"
                  step="any"
                  value={editForm.starting_weight || ""}
                  onChange={(e) => setEditForm((p) => ({ ...p, starting_weight: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Target Weight (kg)</label>
                <input
                  type="number"
                  step="any"
                  value={editForm.target_weight || ""}
                  onChange={(e) => setEditForm((p) => ({ ...p, target_weight: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Goal</label>
              <input
                type="text"
                value={editForm.goal || ""}
                onChange={(e) => setEditForm((p) => ({ ...p, goal: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={editLoading}
                className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs rounded-lg disabled:opacity-50"
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Manual Check-in Modal ─── */}
      {showManualCheckinModal && (
        <Modal
          open={showManualCheckinModal}
          onClose={() => setShowManualCheckinModal(false)}
          title="Log Client Check-in"
        >
          <form onSubmit={handleManualCheckinSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Week Ending Date *
                </label>
                <input
                  type="date"
                  required
                  value={manualCheckin.week_ending}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, week_ending: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Weight (kg) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 88.5"
                  value={manualCheckin.weight}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, weight: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Waist (cm)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 85"
                  value={manualCheckin.waist_cm}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, waist_cm: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Average Weight (kg)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 88.7"
                  value={manualCheckin.average_weight}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, average_weight: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Diet Adherence (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={manualCheckin.diet_adherence}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, diet_adherence: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Training Adherence (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={manualCheckin.training_adherence}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, training_adherence: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Average Daily Steps
                </label>
                <input
                  type="number"
                  value={manualCheckin.average_steps}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, average_steps: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Average Sleep (hours)
                </label>
                <input
                  type="number"
                  step="any"
                  value={manualCheckin.sleep_hours}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, sleep_hours: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Hunger (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={manualCheckin.hunger}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, hunger: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Energy (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={manualCheckin.energy}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, energy: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Stress (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={manualCheckin.stress}
                  onChange={(e) =>
                    setManualCheckin((p) => ({ ...p, stress: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Client Notes
              </label>
              <textarea
                rows={2}
                placeholder="Felt strong this week, recovered well..."
                value={manualCheckin.client_notes}
                onChange={(e) =>
                  setManualCheckin((p) => ({ ...p, client_notes: e.target.value }))
                }
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              />
            </div>

            {/* Progress Photos Upload */}
            <div className="border-t border-zinc-800 pt-3">
              <label className="block text-xs font-semibold text-zinc-300 mb-2">
                Progress Photos (Optional)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <PhotoUploader
                  label="Front Photo"
                  angle="front"
                  uploadEndpoint={`/api/clients/${id}/upload`}
                  currentUrl={manualCheckin.photo_front_url}
                  onUploaded={(url) =>
                    setManualCheckin((p) => ({ ...p, photo_front_url: url || "" }))
                  }
                />
                <PhotoUploader
                  label="Side Photo"
                  angle="side"
                  uploadEndpoint={`/api/clients/${id}/upload`}
                  currentUrl={manualCheckin.photo_side_url}
                  onUploaded={(url) =>
                    setManualCheckin((p) => ({ ...p, photo_side_url: url || "" }))
                  }
                />
                <PhotoUploader
                  label="Back Photo"
                  angle="back"
                  uploadEndpoint={`/api/clients/${id}/upload`}
                  currentUrl={manualCheckin.photo_back_url}
                  onUploaded={(url) =>
                    setManualCheckin((p) => ({ ...p, photo_back_url: url || "" }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowManualCheckinModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={manualSubmitting}
                className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs rounded-lg disabled:opacity-50"
              >
                {manualSubmitting ? "Saving..." : "Save Check-in"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      </div>
    </div>
  );
}

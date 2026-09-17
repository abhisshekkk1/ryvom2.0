"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  Search,
  Users,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import EmptyState, { LoadingState, ErrorState } from "@/components/EmptyState";
import {
  evaluateClientAttention,
  computeMetricSummary,
  formatNum,
  formatDiff,
} from "@/lib/progressAnalytics";
import type { Client, CheckIn } from "@/lib/types";

function Stat({
  label,
  value,
  sub,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-4 sm:p-5 text-left transition-all cursor-pointer ${
        active
          ? "border-amber-400/80 bg-zinc-900 shadow-md shadow-amber-400/5 ring-1 ring-amber-400/40"
          : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
    </button>
  );
}

type FilterType = "all" | "pending" | "follow_up" | "reviewed";

export default function Home() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    goal: "",
    starting_weight: "",
    target_weight: "",
    target_date: "",
    notes: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      await Promise.resolve();
      setError(null);
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      const data = await res.json();
      setClients(data.clients || []);
      setCheckins(data.checkins || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Group check-ins per client
  const clientCheckinsMap = useMemo(() => {
    const map = new Map<string, CheckIn[]>();
    for (const ci of checkins) {
      if (!map.has(ci.client_id)) {
        map.set(ci.client_id, []);
      }
      map.get(ci.client_id)!.push(ci);
    }
    return map;
  }, [checkins]);

  // Clients needing attention
  const attentionList = useMemo(() => {
    const list: { client: Client; flags: string[]; latestCheckin?: CheckIn }[] = [];
    for (const c of clients) {
      const cis = clientCheckinsMap.get(c.id) || [];
      const flags = evaluateClientAttention(c, cis);
      if (flags.length > 0) {
        list.push({
          client: c,
          flags,
          latestCheckin: cis.length > 0 ? cis[0] : undefined,
        });
      }
    }
    return list;
  }, [clients, clientCheckinsMap]);

  // Filtered clients list
  const visible = useMemo(() => {
    return clients
      .filter((c) =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.goal && c.goal.toLowerCase().includes(search.toLowerCase()))
      )
      .filter((c) => {
        if (filter === "all") return true;
        const cis = clientCheckinsMap.get(c.id) || [];
        const latest = cis[0];
        return latest?.status === filter;
      });
  }, [clients, search, filter, clientCheckinsMap]);

  const pendingCount = checkins.filter(
    (x) =>
      x.status === "pending" &&
      checkins.findIndex((c) => c.client_id === x.client_id) === checkins.indexOf(x)
  ).length;

  const reviewedCount = checkins.filter(
    (x) =>
      x.status === "reviewed" &&
      checkins.findIndex((c) => c.client_id === x.client_id) === checkins.indexOf(x)
  ).length;

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.full_name.trim()) {
      setAddError("Full name is required.");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addForm,
          starting_weight: addForm.starting_weight ? Number(addForm.starting_weight) : null,
          target_weight: addForm.target_weight ? Number(addForm.target_weight) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add client");
      setShowAddModal(false);
      setAddForm({
        full_name: "",
        email: "",
        phone: "",
        goal: "",
        starting_weight: "",
        target_weight: "",
        target_date: "",
        notes: "",
      });
      await loadData();
      if (data.client?.id) {
        router.push(`/clients/${data.client.id}`);
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add client");
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <Sidebar />

      <main className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-[#09090b]/90 px-5 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between">
            <div className="pl-12 lg:pl-0">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Coaching Dashboard
              </h1>
              <p className="hidden text-xs text-zinc-400 sm:block">
                PT client check-ins and long-term progress tracking platform.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => router.push("/my-progress")}
                className="flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-400/20 transition-colors cursor-pointer"
              >
                <TrendingUp size={14} />
                My Progress
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer"
              >
                <Plus size={15} />
                Add Client
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 md:p-8 space-y-7">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={() => { loadData(); }} />
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Active Clients"
                  value={String(clients.length)}
                  sub="Under active coaching"
                  icon={<Users size={16} />}
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                />
                <Stat
                  label="Pending Reviews"
                  value={String(pendingCount)}
                  sub="Awaiting feedback"
                  icon={<Clock3 size={16} />}
                  active={filter === "pending"}
                  onClick={() => setFilter("pending")}
                />
                <Stat
                  label="Reviewed"
                  value={String(reviewedCount)}
                  sub="Up to date"
                  icon={<CheckCircle2 size={16} />}
                  active={filter === "reviewed"}
                  onClick={() => setFilter("reviewed")}
                />
                <Stat
                  label="Check-ins Logged"
                  value={String(checkins.length)}
                  sub="Historical entries"
                  icon={<ClipboardList size={16} />}
                />
              </div>

              {/* ─── SECTION 22: CLIENTS NEEDING ATTENTION ─── */}
              {attentionList.length > 0 && (
                <div className="bg-zinc-900/90 border border-amber-400/30 rounded-2xl p-5 shadow-lg shadow-amber-400/5">
                  <div className="flex items-center gap-2 mb-3.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Clients Needing Attention ({attentionList.length})
                    </h3>
                    <span className="text-xs text-zinc-400">
                      &bull; Objective change flags for coach review
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {attentionList.map(({ client, flags, latestCheckin }) => (
                      <div
                        key={client.id}
                        onClick={() => router.push(`/clients/${client.id}`)}
                        className="bg-zinc-950/80 border border-zinc-800/90 hover:border-amber-400/60 p-3.5 rounded-xl transition-all cursor-pointer flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-xs text-white">
                              {client.full_name}
                            </span>
                            {latestCheckin && <StatusBadge status={latestCheckin.status} />}
                          </div>

                          <div className="space-y-1 my-2">
                            {flags.map((flag, idx) => (
                              <div
                                key={idx}
                                className="text-[11px] text-amber-300/90 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 flex items-center gap-1.5"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <span className="truncate">{flag}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-zinc-900 flex items-center justify-between text-[11px] text-zinc-400">
                          <span>
                            Last:{" "}
                            {latestCheckin
                              ? new Date(latestCheckin.week_ending).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                })
                              : "Never"}
                          </span>
                          <span className="text-amber-400 hover:underline flex items-center gap-0.5">
                            Open Profile &rarr;
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── SECTION 23: CLIENT LIST WITH PROGRESS CARDS ─── */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search clients by name or goal…"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="flex gap-1 overflow-x-auto">
                    {(["all", "pending", "follow_up", "reviewed"] as const).map((x) => (
                      <button
                        key={x}
                        onClick={() => setFilter(x)}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                          filter === x
                            ? "bg-amber-400 text-zinc-950"
                            : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                        }`}
                      >
                        {x === "all"
                          ? "All Clients"
                          : x === "follow_up"
                          ? "Follow-up"
                          : x[0].toUpperCase() + x.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {clients.length === 0 ? (
                  <EmptyState
                    title="No clients yet"
                    description="Create your first client profile to begin tracking progress."
                    action={
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer"
                      >
                        <Plus size={16} />
                        Add Client
                      </button>
                    }
                  />
                ) : visible.length === 0 ? (
                  <EmptyState
                    title="No matching clients"
                    description="No clients match your filter or search query."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map((client) => {
                      const cis = clientCheckinsMap.get(client.id) || [];
                      const latest = cis[0];
                      const sortedCis = [...cis].reverse();

                      const weightSummary = computeMetricSummary(sortedCis, "weight");
                      const waistSummary = computeMetricSummary(sortedCis, "waist_cm");
                      const dietSummary = computeMetricSummary(sortedCis, "diet_adherence");
                      const trainingSummary = computeMetricSummary(sortedCis, "training_adherence");

                      const startingW = client.starting_weight ?? weightSummary.first;
                      const currentW = weightSummary.latest ?? startingW;
                      const weightDiff =
                        currentW !== null && startingW !== null
                          ? currentW - startingW
                          : null;

                      return (
                        <div
                          key={client.id}
                          onClick={() => router.push(`/clients/${client.id}`)}
                          className="bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/90 p-4 rounded-2xl transition-all cursor-pointer flex flex-col justify-between hover:shadow-lg group"
                        >
                          <div>
                            {/* Card Header */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2.5 truncate">
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs text-amber-400 shrink-0">
                                  {client.full_name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </div>
                                <div className="truncate">
                                  <h4 className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition-colors">
                                    {client.full_name}
                                  </h4>
                                  <span className="text-[11px] text-zinc-400 block truncate">
                                    {client.goal || "No goal specified"}
                                  </span>
                                </div>
                              </div>
                              {latest ? (
                                <StatusBadge status={latest.status} />
                              ) : (
                                <span className="text-[10px] text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                                  No Check-ins
                                </span>
                              )}
                            </div>

                            {/* Progress Numbers Grid */}
                            <div className="grid grid-cols-2 gap-2 bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl text-xs">
                              {/* Weight */}
                              <div>
                                <span className="text-[10px] text-zinc-500 block">Weight Progress</span>
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className="font-bold text-white">
                                    {formatNum(startingW, 1)} &rarr; {formatNum(currentW, 1)} kg
                                  </span>
                                </div>
                                <span
                                  className={`text-[10px] font-semibold block mt-0.5 ${
                                    weightDiff !== null && weightDiff < 0
                                      ? "text-emerald-400"
                                      : weightDiff !== null && weightDiff > 0
                                      ? "text-amber-400"
                                      : "text-zinc-500"
                                  }`}
                                >
                                  {formatDiff(weightDiff, 1, "kg")}
                                </span>
                              </div>

                              {/* Waist */}
                              <div>
                                <span className="text-[10px] text-zinc-500 block">Waist Progress</span>
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className="font-bold text-white">
                                    {waistSummary.first !== null
                                      ? `${formatNum(waistSummary.first, 1)} → ${formatNum(waistSummary.latest, 1)} cm`
                                      : "-"}
                                  </span>
                                </div>
                                <span
                                  className={`text-[10px] font-semibold block mt-0.5 ${
                                    waistSummary.absoluteChange !== null && waistSummary.absoluteChange < 0
                                      ? "text-emerald-400"
                                      : "text-zinc-400"
                                  }`}
                                >
                                  {formatDiff(waistSummary.absoluteChange, 1, "cm")}
                                </span>
                              </div>

                              {/* Diet */}
                              <div className="pt-2 border-t border-zinc-900">
                                <span className="text-[10px] text-zinc-500 block">Diet Adherence</span>
                                <span className="font-bold text-zinc-200">
                                  {formatNum(dietSummary.average, 0, "", "% avg")}
                                </span>
                              </div>

                              {/* Training */}
                              <div className="pt-2 border-t border-zinc-900">
                                <span className="text-[10px] text-zinc-500 block">Training Adherence</span>
                                <span className="font-bold text-zinc-200">
                                  {formatNum(trainingSummary.average, 0, "", "% avg")}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                            <span>
                              Last:{" "}
                              {latest
                                ? new Date(latest.week_ending).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })
                                : "No submissions"}
                            </span>
                            <span className="text-amber-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                              View Progress &rarr;
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Add Client Modal */}
      {showAddModal && (
        <Modal
          open={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setAddError(null);
          }}
          title="Add New Client"
        >
          <form onSubmit={handleAddClient} className="space-y-4">
            {addError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg">
                {addError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="Client full name"
                value={addForm.full_name}
                onChange={(e) => setAddForm((p) => ({ ...p, full_name: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  placeholder="+91..."
                  value={addForm.phone}
                  onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Primary Goal
              </label>
              <input
                type="text"
                placeholder="e.g. Fat loss, hypertrophy, 10k prep"
                value={addForm.goal}
                onChange={(e) => setAddForm((p) => ({ ...p, goal: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Starting Weight (kg)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 92.4"
                  value={addForm.starting_weight}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, starting_weight: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Target Weight (kg)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 85.0"
                  value={addForm.target_weight}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, target_weight: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Initial Notes
              </label>
              <textarea
                rows={2}
                placeholder="Injuries, medical notes, schedule preferences..."
                value={addForm.notes}
                onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {addLoading ? "Creating..." : "Create Client Profile"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

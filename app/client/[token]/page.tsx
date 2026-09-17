"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Send,
} from "lucide-react";
import PhotoUploader from "@/components/PhotoUploader";

interface PortalClient {
  id: string;
  full_name: string;
  email: string | null;
  goal: string | null;
  starting_weight: number | null;
  target_weight: number | null;
  target_date: string | null;
  notes: string | null;
}

interface PortalCheckIn {
  id: string;
  week_ending: string;
  submitted_at: string;
  weight: number | null;
  average_weight: number | null;
  waist_cm: number | null;
  diet_adherence: number | null;
  training_adherence: number | null;
  average_steps: number | null;
  sleep_hours: number | null;
  hunger: number | null;
  energy: number | null;
  stress: number | null;
  client_notes: string | null;
  status: string;
  photo_front_url?: string | null;
  photo_side_url?: string | null;
  photo_back_url?: string | null;
}

interface PortalReview {
  check_in_id: string;
  wins: string | null;
  issues: string | null;
  adjustments: string | null;
  next_week_goals: string | null;
  reviewed_at: string;
}

function getNextSunday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [client, setClient] = useState<PortalClient | null>(null);
  const [checkins, setCheckins] = useState<PortalCheckIn[]>([]);
  const [reviews, setReviews] = useState<PortalReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "checkin" | "history">("overview");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Check-in form
  const [form, setForm] = useState({
    week_ending: getNextSunday(),
    weight: "",
    average_weight: "",
    waist_cm: "",
    diet_adherence: "",
    training_adherence: "",
    average_steps: "",
    sleep_hours: "",
    hunger: "",
    energy: "",
    stress: "",
    client_notes: "",
    photo_front_url: "",
    photo_side_url: "",
    photo_back_url: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadData = useCallback(async () => {
    try {
      await Promise.resolve();
      setError(null);
      const res = await fetch(`/api/client-portal/${token}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || "This client link is invalid or expired."
        );
      }
      const json = await res.json();
      setClient(json.client);
      setCheckins(json.checkins || []);
      setReviews(json.reviews || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load your portal."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function validate(): string | null {
    if (!form.week_ending) return "Week ending date is required.";
    if (form.weight && (Number(form.weight) <= 0 || Number(form.weight) > 500))
      return "Weight must be between 0 and 500 kg.";
    if (form.waist_cm && Number(form.waist_cm) <= 0)
      return "Waist must be positive.";
    if (
      form.diet_adherence &&
      (Number(form.diet_adherence) < 0 || Number(form.diet_adherence) > 100)
    )
      return "Diet adherence must be 0-100%.";
    if (
      form.training_adherence &&
      (Number(form.training_adherence) < 0 ||
        Number(form.training_adherence) > 100)
    )
      return "Training adherence must be 0-100%.";
    if (form.hunger && (Number(form.hunger) < 1 || Number(form.hunger) > 10))
      return "Hunger must be 1-10.";
    if (form.energy && (Number(form.energy) < 1 || Number(form.energy) > 10))
      return "Energy must be 1-10.";
    if (form.stress && (Number(form.stress) < 1 || Number(form.stress) > 10))
      return "Stress must be 1-10.";
    if (form.average_steps && Number(form.average_steps) < 0)
      return "Steps must be positive.";
    if (
      form.sleep_hours &&
      (Number(form.sleep_hours) < 0 || Number(form.sleep_hours) > 24)
    )
      return "Sleep must be 0-24 hours.";
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      setSubmitError(err);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      const payload: Record<string, unknown> = {
        week_ending: form.week_ending,
      };
      if (form.weight) payload.weight = Number(form.weight);
      if (form.average_weight)
        payload.average_weight = Number(form.average_weight);
      if (form.waist_cm) payload.waist_cm = Number(form.waist_cm);
      if (form.diet_adherence)
        payload.diet_adherence = Number(form.diet_adherence);
      if (form.training_adherence)
        payload.training_adherence = Number(form.training_adherence);
      if (form.average_steps)
        payload.average_steps = Number(form.average_steps);
      if (form.sleep_hours) payload.sleep_hours = Number(form.sleep_hours);
      if (form.hunger) payload.hunger = Number(form.hunger);
      if (form.energy) payload.energy = Number(form.energy);
      if (form.stress) payload.stress = Number(form.stress);
      if (form.client_notes) payload.client_notes = form.client_notes;
      if (form.photo_front_url) payload.photo_front_url = form.photo_front_url;
      if (form.photo_side_url) payload.photo_side_url = form.photo_side_url;
      if (form.photo_back_url) payload.photo_back_url = form.photo_back_url;

      const res = await fetch(`/api/client-portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit.");
      setSubmitSuccess(true);
      setForm({
        week_ending: getNextSunday(),
        weight: "",
        average_weight: "",
        waist_cm: "",
        diet_adherence: "",
        training_adherence: "",
        average_steps: "",
        sleep_hours: "",
        hunger: "",
        energy: "",
        stress: "",
        client_notes: "",
        photo_front_url: "",
        photo_side_url: "",
        photo_back_url: "",
      });
      await loadData();
      setTab("overview");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PortalShell>
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
        </div>
      </PortalShell>
    );
  }

  if (error || !client) {
    return (
      <PortalShell>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 text-4xl">🔒</div>
          <h2 className="text-xl font-semibold text-zinc-300">
            Link not found
          </h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            {error ||
              "This client portal link is invalid or has been revoked. Contact your coach for a new link."}
          </p>
        </div>
      </PortalShell>
    );
  }

  const latest = checkins[0] || null;
  const latestReview = latest
    ? reviews.find((r) => r.check_in_id === latest.id)
    : null;
  const currentWeight = latest?.weight ?? client.starting_weight;

  return (
    <PortalShell>
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">{client.full_name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {client.goal || "Coaching Portal"} ·{" "}
            {currentWeight ? `${currentWeight} kg` : ""}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-6">
          {(
            [
              ["overview", "Overview"],
              ["checkin", "Submit Check-in"],
              ["history", "History"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <div className="space-y-6">
            {submitSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={16} />
                Check-in submitted successfully! Your coach will review it.
              </div>
            )}

            {/* Progress summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                  Starting
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {client.starting_weight
                    ? `${client.starting_weight} kg`
                    : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                  Current
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {currentWeight ? `${currentWeight} kg` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                  Target
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {client.target_weight
                    ? `${client.target_weight} kg`
                    : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                  Check-ins
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {checkins.length}
                </div>
              </div>
            </div>

            {/* Latest feedback */}
            {latestReview && (
              <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5">
                <h3 className="mb-4 text-sm font-semibold text-emerald-400">
                  Coach Feedback — Week ending{" "}
                  {latest &&
                    new Date(latest.week_ending).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                </h3>
                <div className="space-y-4">
                  {latestReview.wins && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500">
                        What went well
                      </span>
                      <p className="mt-1 text-sm text-zinc-300">
                        {latestReview.wins}
                      </p>
                    </div>
                  )}
                  {latestReview.issues && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500">
                        What needs work
                      </span>
                      <p className="mt-1 text-sm text-zinc-300">
                        {latestReview.issues}
                      </p>
                    </div>
                  )}
                  {latestReview.adjustments && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500">
                        Adjustments
                      </span>
                      <p className="mt-1 text-sm text-zinc-300">
                        {latestReview.adjustments}
                      </p>
                    </div>
                  )}
                  {latestReview.next_week_goals && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500">
                        Next week&apos;s goals
                      </span>
                      <p className="mt-1 text-sm text-zinc-300">
                        {latestReview.next_week_goals}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!latestReview && latest && latest.status === "pending" && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                Your latest check-in is being reviewed by your coach. Feedback
                will appear here.
              </div>
            )}

            {!latest && (
              <div className="py-8 text-center">
                <p className="text-zinc-400">
                  No check-ins yet. Submit your first check-in to get started!
                </p>
                <button
                  onClick={() => setTab("checkin")}
                  className="mt-4 rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 transition-colors"
                >
                  Submit check-in
                </button>
              </div>
            )}
          </div>
        )}

        {/* Check-in Form */}
        {tab === "checkin" && (
          <div className="space-y-5">
            {submitError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {submitError}
              </div>
            )}

            <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Week ending date <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.week_ending}
                  onChange={(e) =>
                    setForm({ ...form, week_ending: e.target.value })
                  }
                  type="date"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-zinc-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Weight (kg)"
                  value={form.weight}
                  onChange={(v) => setForm({ ...form, weight: v })}
                  type="number"
                  step="0.1"
                  placeholder="92.4"
                />
                <FormField
                  label="Average weight (kg)"
                  value={form.average_weight}
                  onChange={(v) => setForm({ ...form, average_weight: v })}
                  type="number"
                  step="0.1"
                  placeholder="92.7"
                />
              </div>

              <FormField
                label="Waist (cm)"
                value={form.waist_cm}
                onChange={(v) => setForm({ ...form, waist_cm: v })}
                type="number"
                step="0.1"
                placeholder="91"
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Diet adherence (%)"
                  value={form.diet_adherence}
                  onChange={(v) => setForm({ ...form, diet_adherence: v })}
                  type="number"
                  placeholder="90"
                  min="0"
                  max="100"
                />
                <FormField
                  label="Training adherence (%)"
                  value={form.training_adherence}
                  onChange={(v) => setForm({ ...form, training_adherence: v })}
                  type="number"
                  placeholder="100"
                  min="0"
                  max="100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Avg daily steps"
                  value={form.average_steps}
                  onChange={(v) => setForm({ ...form, average_steps: v })}
                  type="number"
                  placeholder="7200"
                />
                <FormField
                  label="Sleep (hours)"
                  value={form.sleep_hours}
                  onChange={(v) => setForm({ ...form, sleep_hours: v })}
                  type="number"
                  step="0.1"
                  placeholder="7.5"
                  min="0"
                  max="24"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  label="Hunger (1-10)"
                  value={form.hunger}
                  onChange={(v) => setForm({ ...form, hunger: v })}
                  type="number"
                  placeholder="5"
                  min="1"
                  max="10"
                />
                <FormField
                  label="Energy (1-10)"
                  value={form.energy}
                  onChange={(v) => setForm({ ...form, energy: v })}
                  type="number"
                  placeholder="7"
                  min="1"
                  max="10"
                />
                <FormField
                  label="Stress (1-10)"
                  value={form.stress}
                  onChange={(v) => setForm({ ...form, stress: v })}
                  type="number"
                  placeholder="4"
                  min="1"
                  max="10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Notes for coach
                </label>
                <textarea
                  value={form.client_notes}
                  onChange={(e) =>
                    setForm({ ...form, client_notes: e.target.value })
                  }
                  rows={4}
                  placeholder="How was your week? Anything your coach should know?"
                  className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-700 focus:border-zinc-600"
                />
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <div className="mb-2.5">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Weekly Progress Photos
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Upload your Front, Side, and Back photos. Images are uploaded directly to secure storage.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PhotoUploader
                    label="Front Photo"
                    angle="front"
                    uploadEndpoint={`/api/client-portal/${token}/upload`}
                    currentUrl={form.photo_front_url}
                    onUploaded={(url) => setForm((prev) => ({ ...prev, photo_front_url: url || "" }))}
                  />
                  <PhotoUploader
                    label="Side Photo"
                    angle="side"
                    uploadEndpoint={`/api/client-portal/${token}/upload`}
                    currentUrl={form.photo_side_url}
                    onUploaded={(url) => setForm((prev) => ({ ...prev, photo_side_url: url || "" }))}
                  />
                  <PhotoUploader
                    label="Back Photo"
                    angle="back"
                    uploadEndpoint={`/api/client-portal/${token}/upload`}
                    currentUrl={form.photo_back_url}
                    onUploaded={(url) => setForm((prev) => ({ ...prev, photo_back_url: url || "" }))}
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Send size={15} />
                {submitting ? "Submitting…" : "Submit check-in"}
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {tab === "history" && (
          <div className="space-y-3">
            {checkins.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">
                No check-ins yet.
              </div>
            ) : (
              checkins.map((ci) => {
                const rev = reviews.find((r) => r.check_in_id === ci.id);
                const isExpanded = expanded === ci.id;
                return (
                  <div
                    key={ci.id}
                    className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpanded(isExpanded ? null : ci.id)
                      }
                      className="flex w-full items-center justify-between p-4 text-left"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          Week ending{" "}
                          {new Date(ci.week_ending).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {ci.weight && `${ci.weight} kg`}
                          {ci.diet_adherence != null &&
                            ` · ${ci.diet_adherence}% diet`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            ci.status === "reviewed"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {ci.status === "reviewed"
                            ? "Reviewed"
                            : "Pending"}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={15} className="text-zinc-600" />
                        ) : (
                          <ChevronDown size={15} className="text-zinc-600" />
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-zinc-800 p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {ci.weight && (
                            <div>
                              <span className="text-zinc-500">Weight:</span>{" "}
                              {ci.weight} kg
                            </div>
                          )}
                          {ci.waist_cm && (
                            <div>
                              <span className="text-zinc-500">Waist:</span>{" "}
                              {ci.waist_cm} cm
                            </div>
                          )}
                          {ci.diet_adherence != null && (
                            <div>
                              <span className="text-zinc-500">Diet:</span>{" "}
                              {ci.diet_adherence}%
                            </div>
                          )}
                          {ci.training_adherence != null && (
                            <div>
                              <span className="text-zinc-500">Training:</span>{" "}
                              {ci.training_adherence}%
                            </div>
                          )}
                          {ci.average_steps && (
                            <div>
                              <span className="text-zinc-500">Steps:</span>{" "}
                              {ci.average_steps.toLocaleString()}
                            </div>
                          )}
                          {ci.sleep_hours && (
                            <div>
                              <span className="text-zinc-500">Sleep:</span>{" "}
                              {ci.sleep_hours}h
                            </div>
                          )}
                        </div>
                        {ci.client_notes && (
                          <p className="text-sm text-zinc-400">
                            {ci.client_notes}
                          </p>
                        )}
                        {(ci.photo_front_url || ci.photo_side_url || ci.photo_back_url) && (
                          <div className="border-t border-zinc-800/80 pt-3">
                            <span className="text-xs font-semibold text-zinc-400 block mb-2">
                              Progress Photos
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {ci.photo_front_url && (
                                <div className="space-y-1">
                                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                                    <Image src={ci.photo_front_url} alt="Front" fill className="object-cover" unoptimized />
                                  </div>
                                  <span className="text-[10px] text-zinc-500 text-center block">Front</span>
                                </div>
                              )}
                              {ci.photo_side_url && (
                                <div className="space-y-1">
                                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                                    <Image src={ci.photo_side_url} alt="Side" fill className="object-cover" unoptimized />
                                  </div>
                                  <span className="text-[10px] text-zinc-500 text-center block">Side</span>
                                </div>
                              )}
                              {ci.photo_back_url && (
                                <div className="space-y-1">
                                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                                    <Image src={ci.photo_back_url} alt="Back" fill className="object-cover" unoptimized />
                                  </div>
                                  <span className="text-[10px] text-zinc-500 text-center block">Back</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {rev && (
                          <div className="border-t border-zinc-800 pt-3 space-y-2">
                            <span className="text-xs font-medium text-emerald-400">
                              Coach Feedback
                            </span>
                            {rev.wins && (
                              <p className="text-sm text-zinc-300">
                                <span className="text-zinc-500">Wins:</span>{" "}
                                {rev.wins}
                              </p>
                            )}
                            {rev.issues && (
                              <p className="text-sm text-zinc-300">
                                <span className="text-zinc-500">Issues:</span>{" "}
                                {rev.issues}
                              </p>
                            )}
                            {rev.adjustments && (
                              <p className="text-sm text-zinc-300">
                                <span className="text-zinc-500">
                                  Adjustments:
                                </span>{" "}
                                {rev.adjustments}
                              </p>
                            )}
                            {rev.next_week_goals && (
                              <p className="text-sm text-zinc-300">
                                <span className="text-zinc-500">
                                  Next week:
                                </span>{" "}
                                {rev.next_week_goals}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <header className="border-b border-zinc-800 px-5 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Image
            src="/logo_small.jpg"
            alt="Ryvom"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-bold tracking-[0.15em]">RYVOM</span>
          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Client Portal
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  step,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-zinc-600"
      />
    </div>
  );
}

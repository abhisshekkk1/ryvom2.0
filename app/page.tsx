"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronRight, ClipboardList, Clock3, Dumbbell, Menu, Plus, Search, Users, X } from "lucide-react";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Client = { id: string; full_name: string; email?: string | null; goal?: string | null; starting_weight?: number | null; target_weight?: number | null; active: boolean };
type CheckIn = { id: string; client_id: string; week_ending: string; weight?: number | null; average_weight?: number | null; waist_cm?: number | null; diet_adherence?: number | null; training_adherence?: number | null; average_steps?: number | null; sleep_hours?: number | null; hunger?: number | null; energy?: number | null; stress?: number | null; client_notes?: string | null; status: "pending" | "reviewed" | "follow_up" };

const demoClients: Client[] = [
  { id: "demo-1", full_name: "Rahul Sharma", email: "rahul@example.com", goal: "Fat loss", starting_weight: 98.2, target_weight: 85, active: true },
  { id: "demo-2", full_name: "Aman Verma", email: "aman@example.com", goal: "Recomposition", starting_weight: 82.4, target_weight: 78, active: true },
  { id: "demo-3", full_name: "Priya Singh", email: "priya@example.com", goal: "Fat loss", starting_weight: 76.4, target_weight: 68, active: true },
];
const demoCheckins: CheckIn[] = [
  { id: "check-1", client_id: "demo-1", week_ending: "2026-09-13", weight: 92.4, average_weight: 92.7, waist_cm: 91, diet_adherence: 91, training_adherence: 100, average_steps: 7200, sleep_hours: 7.1, hunger: 5, energy: 8, stress: 4, client_notes: "Everything was good this week. Felt hungry at night twice but managed it.", status: "pending" },
  { id: "check-2", client_id: "demo-2", week_ending: "2026-09-13", weight: 82.8, average_weight: 82.7, waist_cm: 84, diet_adherence: 72, training_adherence: 75, average_steps: 5100, sleep_hours: 6.2, hunger: 7, energy: 6, stress: 7, client_notes: "Busy week at work. Missed two sessions.", status: "follow_up" },
  { id: "check-3", client_id: "demo-3", week_ending: "2026-09-13", weight: 76.1, average_weight: 76.1, waist_cm: 79, diet_adherence: 96, training_adherence: 100, average_steps: 9100, sleep_hours: 7.8, hunger: 3, energy: 9, stress: 3, client_notes: "Great week. Strength is improving and hunger is easy to manage.", status: "reviewed" },
];

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span><span className="text-zinc-500">{icon}</span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-xs text-zinc-500">{sub}</div></div>;
}

export default function Home() {
  const [clients, setClients] = useState<Client[]>(demoClients);
  const [checkins, setCheckins] = useState<CheckIn[]>(demoCheckins);
  const [selected, setSelected] = useState<string | null>("demo-1");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "follow_up" | "reviewed">("all");
  const [mobileNav, setMobileNav] = useState(false);
  const [review, setReview] = useState({ wins: "", issues: "", adjustments: "", goals: "", notes: "" });

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data: c } = await supabase.from("clients").select("id,full_name,email,goal,starting_weight,target_weight,active").eq("coach_user_id", user.id).eq("active", true).order("full_name");
      if (c?.length) setClients(c);
      if (c?.length) {
        const { data: ci } = await supabase.from("check_ins").select("*").in("client_id", c.map(x => x.id)).order("week_ending", { ascending: false });
        if (ci?.length) setCheckins(ci);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const visible = useMemo(() => {
    return clients.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase())).filter(c => {
      const latest = checkins.find(x => x.client_id === c.id);
      return filter === "all" || latest?.status === filter;
    });
  }, [clients, checkins, search, filter]);

  const currentClient = clients.find(c => c.id === selected) ?? clients[0];
  const currentCheckin = checkins.find(x => x.client_id === currentClient?.id);
  const pending = checkins.filter(x => x.status === "pending").length;
  const followup = checkins.filter(x => x.status === "follow_up").length;
  const reviewed = checkins.filter(x => x.status === "reviewed").length;

  useEffect(() => {
    if (currentCheckin) setReview({ wins: "", issues: "", adjustments: "", goals: "", notes: "" });
  }, [selected]);

  async function saveReview() {
    if (!currentCheckin) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !currentCheckin.id.startsWith("check-")) {
      await supabase.from("coach_reviews").upsert({ check_in_id: currentCheckin.id, coach_notes: review.notes, wins: review.wins, issues: review.issues, adjustments: review.adjustments, next_week_goals: review.goals });
      await supabase.from("check_ins").update({ status: "reviewed" }).eq("id", currentCheckin.id);
    }
    setCheckins(prev => prev.map(x => x.id === currentCheckin.id ? { ...x, status: "reviewed" } : x));
  }

  return <div className="min-h-screen bg-[#09090b]">
    <aside className={`fixed inset-y-0 left-0 z-30 w-64 border-r border-zinc-800 bg-[#0c0c0f] p-5 transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center justify-between"><div><div className="text-xl font-bold tracking-tight">RYVOM<span className="text-zinc-600">.</span></div><div className="mt-0.5 text-[10px] font-medium uppercase tracking-[.2em] text-zinc-600">Coach OS</div></div><button onClick={() => setMobileNav(false)} className="lg:hidden text-zinc-500"><X size={18}/></button></div>
      <nav className="mt-10 space-y-1"><button className="flex w-full items-center gap-3 rounded-xl bg-zinc-800/80 px-3 py-2.5 text-sm font-medium"><ClipboardList size={17}/> Check-ins</button><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-500 hover:bg-zinc-900"><Users size={17}/> Clients</button></nav>
      <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-zinc-800 p-3"><div className="text-xs text-zinc-500">Coach</div><div className="mt-1 text-sm font-medium">Abhishek</div></div>
    </aside>
    {mobileNav && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setMobileNav(false)}/>}

    <main className="lg:pl-64"><header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-[#09090b]/90 px-5 py-4 backdrop-blur md:px-8"><div className="flex items-center justify-between"><button onClick={() => setMobileNav(true)} className="mr-3 lg:hidden text-zinc-400"><Menu/></button><div><h1 className="text-lg font-semibold">Check-ins</h1><p className="hidden text-xs text-zinc-500 sm:block">Review client progress and keep coaching moving.</p></div><button className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-black hover:bg-zinc-200"><Plus size={15}/> Add client</button></div></header>
      <div className="mx-auto max-w-[1500px] p-5 md:p-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Active clients" value={String(clients.length)} sub="Currently coaching" icon={<Users size={16}/>}/><Stat label="Pending" value={String(pending)} sub="Need your review" icon={<Clock3 size={16}/>}/><Stat label="Follow-up" value={String(followup)} sub="Need attention" icon={<ClipboardList size={16}/>}/><Stat label="Reviewed" value={String(reviewed)} sub="Completed this cycle" icon={<CheckCircle2 size={16}/>}/></div>
        <div className="mt-7 grid gap-6 xl:grid-cols-[390px_1fr]">
          <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c0c0f]"><div className="border-b border-zinc-800 p-4"><div className="relative"><Search className="absolute left-3 top-2.5 text-zinc-600" size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-600"/></div><div className="mt-3 flex gap-1 overflow-x-auto">{(["all","pending","follow_up","reviewed"] as const).map(x => <button key={x} onClick={() => setFilter(x)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${filter === x ? "bg-zinc-100 text-black" : "text-zinc-500 hover:bg-zinc-900"}`}>{x === "all" ? "All" : x === "follow_up" ? "Follow-up" : x[0].toUpperCase()+x.slice(1)}</button>)}</div></div>
            <div className="divide-y divide-zinc-800/70">{visible.map(c => { const ci = checkins.find(x => x.client_id === c.id); return <button key={c.id} onClick={() => setSelected(c.id)} className={`flex w-full items-center justify-between p-4 text-left hover:bg-zinc-900/70 ${selected === c.id ? "bg-zinc-900" : ""}`}><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold">{c.full_name.split(" ").map(n=>n[0]).join("").slice(0,2)}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{c.full_name}</div><div className="mt-0.5 truncate text-xs text-zinc-600">{c.goal || "Client"}</div></div></div><div className="flex items-center gap-2">{ci && <span className={`h-2 w-2 rounded-full ${ci.status === "pending" ? "bg-amber-400" : ci.status === "follow_up" ? "bg-red-400" : "bg-emerald-400"}`}/>}<ChevronRight size={15} className="text-zinc-700"/></div></button>})}</div>
          </section>

          {currentClient && currentCheckin ? <section className="min-w-0 space-y-5"><div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5 md:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{currentClient.full_name}</h2><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${currentCheckin.status === "pending" ? "bg-amber-500/10 text-amber-400" : currentCheckin.status === "follow_up" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>{currentCheckin.status.replace("_", " ")}</span></div><p className="mt-1 text-xs text-zinc-500">Week ending {new Date(currentCheckin.week_ending).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"})} · {currentClient.goal}</p></div><button onClick={saveReview} className="rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black hover:bg-zinc-200">Save review</button></div>
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="Weight" value={`${currentCheckin.weight ?? "—"} kg`} sub={currentCheckin.average_weight ? `Avg ${currentCheckin.average_weight} kg` : ""}/><Metric label="Waist" value={`${currentCheckin.waist_cm ?? "—"} cm`} sub="This check-in"/><Metric label="Diet" value={`${currentCheckin.diet_adherence ?? "—"}%`} sub="Adherence"/><Metric label="Training" value={`${currentCheckin.training_adherence ?? "—"}%`} sub="Adherence"/></div>
            </div>
            <div className="grid gap-5 md:grid-cols-2"><InfoCard title="Lifestyle & recovery"><Row a="Average steps" b={currentCheckin.average_steps ? currentCheckin.average_steps.toLocaleString() : "—"}/><Row a="Sleep" b={currentCheckin.sleep_hours ? `${currentCheckin.sleep_hours} h` : "—"}/><Row a="Hunger" b={currentCheckin.hunger ? `${currentCheckin.hunger}/10` : "—"}/><Row a="Energy" b={currentCheckin.energy ? `${currentCheckin.energy}/10` : "—"}/><Row a="Stress" b={currentCheckin.stress ? `${currentCheckin.stress}/10` : "—"}/></InfoCard><InfoCard title="Client notes"><p className="text-sm leading-6 text-zinc-400">{currentCheckin.client_notes || "No notes submitted."}</p></InfoCard></div>
            <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5 md:p-6"><div className="mb-5"><h3 className="font-semibold">Coach review</h3><p className="mt-1 text-xs text-zinc-600">Write the feedback the client needs for the next week.</p></div><div className="grid gap-4 md:grid-cols-2">{([ ["wins","What went well"],["issues","What needs work"],["adjustments","This week's adjustments"],["goals","Next week's goals"] ] as const).map(([key,label]) => <label key={key} className="block"><span className="mb-2 block text-xs font-medium text-zinc-500">{label}</span><textarea value={review[key]} onChange={e => setReview({...review,[key]:e.target.value})} rows={4} placeholder="Write your notes..." className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-zinc-600"/></label>)}</div><label className="mt-4 block"><span className="mb-2 block text-xs font-medium text-zinc-500">Private coach notes</span><textarea value={review.notes} onChange={e => setReview({...review,notes:e.target.value})} rows={3} className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm outline-none focus:border-zinc-600"/></label></div>
          </section> : <div className="flex min-h-[500px] items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-sm text-zinc-600">No check-in selected.</div>}
        </div>
      </div>
    </main>
  </div>;
}

function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="text-[11px] uppercase tracking-wider text-zinc-600">{label}</div><div className="mt-2 text-lg font-semibold">{value}</div><div className="mt-0.5 text-[11px] text-zinc-600">{sub}</div></div>}
function InfoCard({title,children}:{title:string;children:React.ReactNode}){return <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0f] p-5"><h3 className="mb-4 text-sm font-semibold">{title}</h3>{children}</div>}
function Row({a,b}:{a:string;b:string}){return <div className="flex justify-between border-t border-zinc-800/70 py-3 text-sm"><span className="text-zinc-500">{a}</span><span className="font-medium text-zinc-300">{b}</span></div>}

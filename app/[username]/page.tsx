import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface PublicProfileProps {
  params: Promise<{ username: string }>;
}

export interface PublicProfileData {
  user_id: string;
  id?: string;
  username: string;
  bio?: string;
  youtube_url?: string;
  medium_url?: string;
}

export default async function PublicProfilePage(props: PublicProfileProps) {
  const params = await props.params;
  const cleanUsername = decodeURIComponent(params.username).replace("@", "");

  // 1. ISOLATE THE PROFILE FETCH:
  // Fetch ONLY the user from user_settings matching the username
  let profile: PublicProfileData | null = null;
  let profileError: unknown = null;

  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("user_id, username, bio, youtube_url, medium_url")
      .ilike("username", cleanUsername)
      .maybeSingle();

    if (error) {
      console.error("Supabase Error:", error);
      profileError = error;
    }
    if (data) {
      profile = data as PublicProfileData;
    }
  } catch (err) {
    console.error("Supabase Error:", err);
    profileError = err;
  }

  // Only trigger the "Not Found" UI if profileError occurs or profile is null
  if (profileError || !profile) {
    return (
      <div className="min-h-screen bg-[#0b0b0e] text-zinc-100 flex flex-col items-center justify-center p-6 text-center antialiased">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-3xl mb-4">
          🔍
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Athlete Profile Not Found
        </h1>
        <p className="text-xs text-zinc-400 max-w-sm mt-2">
          The handle <strong className="text-rose-400">@{cleanUsername}</strong> does not exist or has not published a public link-in-bio portfolio.
        </p>

        <Link
          href="/"
          className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-[#ff334b] to-[#ff5b6e] text-white font-bold text-xs shadow-lg shadow-[#ff334b]/20 active:scale-95 transition"
        >
          Return to Ryvom App
        </Link>
      </div>
    );
  }

  const userId = profile.user_id || profile.id;

  // 2. MAKE STAT FETCHING FAULT-TOLERANT:
  
  // a) Peak Weight in a separate try/catch block
  let peakWeight: number | null = null;
  try {
    let weightQuery = supabase
      .from("weight_logs")
      .select("weight_kg");

    if (userId) {
      weightQuery = weightQuery.eq("user_id", userId);
    }

    const { data: peakData, error: weightErr } = await weightQuery
      .order("weight_kg", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (weightErr) {
      console.error("Supabase Error:", weightErr);
    }

    if (peakData?.weight_kg) {
      peakWeight = Number(peakData.weight_kg);
    } else {
      // Fallback query to progress table
      let progQuery = supabase.from("progress").select("weight");
      if (userId) {
        progQuery = progQuery.eq("user_id", userId);
      }
      const { data: progPeak, error: progErr } = await progQuery
        .order("weight", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (progErr) {
        console.error("Supabase Error:", progErr);
      }

      if (progPeak?.weight) {
        peakWeight = Number(progPeak.weight);
      }
    }
  } catch (err) {
    console.error("Supabase Error:", err);
  }

  // b) Top Lifts in separate try/catch blocks
  let topSquatWeight: number | null = null;
  let topBenchWeight: number | null = null;
  let topDeadliftWeight: number | null = null;

  // Fetch Squat PR
  try {
    let squatQuery = supabase
      .from("lift_logs")
      .select("weight_kg")
      .ilike("lift_type", "%squat%");

    if (userId) {
      squatQuery = squatQuery.eq("user_id", userId);
    }

    const { data, error } = await squatQuery
      .order("weight_kg", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase Error:", error);
    }
    if (data?.weight_kg) {
      topSquatWeight = Number(data.weight_kg);
    }
  } catch (err) {
    console.error("Supabase Error:", err);
  }

  // Fetch Bench PR
  try {
    let benchQuery = supabase
      .from("lift_logs")
      .select("weight_kg")
      .or("lift_type.ilike.%bench%,lift_type.ilike.%bench press%");

    if (userId) {
      benchQuery = benchQuery.eq("user_id", userId);
    }

    const { data, error } = await benchQuery
      .order("weight_kg", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase Error:", error);
    }
    if (data?.weight_kg) {
      topBenchWeight = Number(data.weight_kg);
    }
  } catch (err) {
    console.error("Supabase Error:", err);
  }

  // Fetch Deadlift PR
  try {
    let deadliftQuery = supabase
      .from("lift_logs")
      .select("weight_kg")
      .ilike("lift_type", "%deadlift%");

    if (userId) {
      deadliftQuery = deadliftQuery.eq("user_id", userId);
    }

    const { data, error } = await deadliftQuery
      .order("weight_kg", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase Error:", error);
    }
    if (data?.weight_kg) {
      topDeadliftWeight = Number(data.weight_kg);
    }
  } catch (err) {
    console.error("Supabase Error:", err);
  }

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-zinc-100 flex flex-col antialiased">
      {/* Navigation Bar */}
      <header className="border-b border-zinc-800/80 bg-[#0e0e12]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff334b] to-[#ff5b6e] flex items-center justify-center font-black text-white shadow-lg shadow-[#ff334b]/20">
              R
            </div>
            <span className="font-extrabold text-base text-white tracking-wide uppercase">Ryvom</span>
          </div>

          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700/50 flex items-center gap-1 active:scale-95"
          >
            Create Your Bio
          </Link>
        </div>
      </header>

      {/* Main Link-in-Bio Minimalist Container */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-10 space-y-8">
        
        {/* SECTION 1: HEADER (@username & bio) */}
        <section className="text-center space-y-4">
          <div className="inline-block p-1 rounded-full bg-gradient-to-tr from-[#ff334b] via-[#ff5b6e] to-purple-600 shadow-xl shadow-[#ff334b]/20">
            <div className="w-20 h-20 rounded-full bg-[#0b0b0e] flex items-center justify-center font-black text-3xl text-white">
              {profile.username ? profile.username.charAt(0).toUpperCase() : "A"}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                @{profile.username}
              </h1>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ATHLETE
              </span>
            </div>

            <p className="text-xs sm:text-sm text-zinc-300 max-w-md mx-auto leading-relaxed italic">
              &quot;{profile.bio || "Documenting strength highlights and physical trajectory."}&quot;
            </p>
          </div>
        </section>

        {/* SECTION 2: SOCIALS (Icon link buttons) */}
        {(profile.youtube_url || profile.medium_url) && (
          <section className="flex flex-wrap items-center justify-center gap-3">
            {profile.youtube_url && (
              <a
                href={profile.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-[#121216] hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition flex items-center gap-2 shadow-md active:scale-95"
              >
                <span>▶️</span>
                <span>YouTube</span>
              </a>
            )}

            {profile.medium_url && (
              <a
                href={profile.medium_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-[#121216] hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition flex items-center gap-2 shadow-md active:scale-95"
              >
                <span>✍️</span>
                <span>Medium Blog</span>
              </a>
            )}
          </section>
        )}

        {/* SECTION 3: PEAK WEIGHT (Single stat block for all-time peak weight) */}
        <section className="p-6 rounded-2xl bg-[#121216] border border-amber-900/30 bg-amber-950/10 shadow-xl text-center space-y-1">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
            ⚖️ Peak Cutting Weight
          </span>
          <div className="text-3xl sm:text-4xl font-black text-white">
            {peakWeight !== null ? peakWeight : "TBD"}{" "}
            {peakWeight !== null && <span className="text-sm font-normal text-zinc-400">kg</span>}
          </div>
          <span className="text-[10px] text-zinc-400 block font-medium">
            All-Time Highest Weight On Record
          </span>
        </section>

        {/* SECTION 4: TOP LIFTS (Clean 3-stat grid for Squat, Bench, and Deadlift PRs) */}
        <section className="space-y-3">
          <div className="text-center text-xs font-bold text-zinc-400 uppercase tracking-wider">
            🏋️‍♂️ Top Compound Lifts (PRs)
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            {/* Squat Card */}
            <div className="p-4 rounded-2xl bg-[#121216] border border-rose-900/30 bg-rose-950/10 shadow-lg space-y-1">
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block">
                🍗 Squat
              </span>
              <div className="text-xl sm:text-2xl font-black text-white">
                {topSquatWeight !== null ? topSquatWeight : "-"}{" "}
                {topSquatWeight !== null && <span className="text-xs font-normal text-zinc-400">kg</span>}
              </div>
              <span className="text-[9px] text-zinc-500 block">Max Weight</span>
            </div>

            {/* Bench Press Card */}
            <div className="p-4 rounded-2xl bg-[#121216] border border-cyan-900/30 bg-cyan-950/10 shadow-lg space-y-1">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">
                💪 Bench
              </span>
              <div className="text-xl sm:text-2xl font-black text-white">
                {topBenchWeight !== null ? topBenchWeight : "-"}{" "}
                {topBenchWeight !== null && <span className="text-xs font-normal text-zinc-400">kg</span>}
              </div>
              <span className="text-[9px] text-zinc-500 block">Max Weight</span>
            </div>

            {/* Deadlift Card */}
            <div className="p-4 rounded-2xl bg-[#121216] border border-emerald-900/30 bg-emerald-950/10 shadow-lg space-y-1">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                💀 Deadlift
              </span>
              <div className="text-xl sm:text-2xl font-black text-white">
                {topDeadliftWeight !== null ? topDeadliftWeight : "-"}{" "}
                {topDeadliftWeight !== null && <span className="text-xs font-normal text-zinc-400">kg</span>}
              </div>
              <span className="text-[9px] text-zinc-500 block">Max Weight</span>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-[#07070a] py-6 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} Ryvom App • Public Link-in-Bio Portfolio.
      </footer>
    </div>
  );
}

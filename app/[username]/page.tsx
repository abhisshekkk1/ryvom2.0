import { use } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import WeightTracker from "@/components/WeightTracker";
import StrengthTracker from "@/components/StrengthTracker";

interface PublicProfileProps {
  params: Promise<{ username: string }>;
}

export interface PublicProfileData {
  id: string;
  user_id: string;
  username: string;
  bio?: string;
  goal_weight?: number;
  instagram_url?: string;
  youtube_url?: string;
  medium_url?: string;
}

export default async function PublicProfilePage(props: PublicProfileProps) {
  const params = await props.params;
  const cleanUsername = decodeURIComponent(params.username).replace('@', '');

  // 1. Fetch public profile settings from Supabase
  let profile: PublicProfileData | null = null;

  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .ilike("username", cleanUsername)
      .maybeSingle();

    if (data) {
      profile = data as PublicProfileData;
    }
  } catch (err) {
    console.error("Public profile fetch error:", err);
  }

  // 2. 404 Fallback if handle does not exist in Supabase
  if (!profile) {
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

  const userProp = { id: profile.user_id };

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-zinc-100 flex flex-col antialiased">
      {/* Header Bar */}
      <header className="border-b border-zinc-800/80 bg-[#0e0e12]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff334b] to-[#ff5b6e] flex items-center justify-center font-black text-white shadow-lg shadow-[#ff334b]/20">
              R
            </div>
            <span className="font-extrabold text-lg text-white tracking-wide uppercase">Ryvom Bio</span>
          </div>

          <Link
            href="/"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700/50 flex items-center gap-1.5 active:scale-95"
          >
            Create Your Bio
          </Link>
        </div>
      </header>

      {/* Main Link-in-Bio Portfolio Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Profile Card & Bio */}
        <div className="p-8 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-2xl space-y-6 text-center">
          <div className="flex flex-col items-center">
            {/* Avatar Circle */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#ff334b] via-[#ff5b6e] to-purple-600 p-1 shadow-xl shadow-[#ff334b]/20 mb-3">
              <div className="w-full h-full rounded-full bg-[#0b0b0e] flex items-center justify-center font-black text-2xl text-white">
                {profile.username ? profile.username.charAt(0).toUpperCase() : "A"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-white tracking-tight">
                @{profile.username}
              </h1>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                LIVE ATHLETE
              </span>
            </div>

            <p className="text-xs text-zinc-300 max-w-md mt-2 leading-relaxed italic">
              "{profile.bio || "Documenting the journey from 140kg to 100kg."}"
            </p>
          </div>

          {/* Social Links Row */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-zinc-800/60">
            {profile.instagram_url && (
              <a
                href={profile.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-[#0b0b0e] hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition flex items-center gap-2 active:scale-95"
              >
                <span>📸</span>
                <span>Instagram</span>
              </a>
            )}

            {profile.youtube_url && (
              <a
                href={profile.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-[#0b0b0e] hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition flex items-center gap-2 active:scale-95"
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
                className="px-4 py-2 rounded-xl bg-[#0b0b0e] hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition flex items-center gap-2 active:scale-95"
              >
                <span>✍️</span>
                <span>Medium Blog</span>
              </a>
            )}
          </div>
        </div>

        {/* The "Live" Stats Grid: Top Compound Working Sets & Recent Weekly Avg Weight */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-lg text-center space-y-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
              ⚖️ Weekly Avg
            </span>
            <div className="text-xl sm:text-2xl font-black text-white">
              78.4 <span className="text-xs font-normal text-zinc-400">kg</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-medium block">7-Day Moving Mean</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#121216] border border-rose-900/30 bg-rose-950/10 shadow-lg text-center space-y-1">
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block">
              🍗 Squat 1RM
            </span>
            <div className="text-xl sm:text-2xl font-black text-white">
              145 <span className="text-xs font-normal text-zinc-400">kg</span>
            </div>
            <span className="text-[10px] text-zinc-400 block">Top Set: 130kg × 5</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#121216] border border-cyan-900/30 bg-cyan-950/10 shadow-lg text-center space-y-1">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider block">
              💪 Bench 1RM
            </span>
            <div className="text-xl sm:text-2xl font-black text-white">
              102.5 <span className="text-xs font-normal text-zinc-400">kg</span>
            </div>
            <span className="text-[10px] text-zinc-400 block">Top Set: 90kg × 5</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#121216] border border-emerald-900/30 bg-emerald-950/10 shadow-lg text-center space-y-1">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
              💀 Deadlift 1RM
            </span>
            <div className="text-xl sm:text-2xl font-black text-white">
              175 <span className="text-xs font-normal text-zinc-400">kg</span>
            </div>
            <span className="text-[10px] text-zinc-400 block">Top Set: 155kg × 5</span>
          </div>
        </div>

        {/* Live Weight Progress Trend */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
            <span>📈 Body Weight Trajectory</span>
            <span className="text-emerald-400">Live Sync</span>
          </div>
          <WeightTracker user={userProp} goalWeight={profile.goal_weight || 72.0} />
        </div>

        {/* Live Powerlifting & Strength Progression */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
            <span>🏋️‍♂️ Powerlifting & Compound Strength</span>
            <span className="text-rose-400">Live Sync</span>
          </div>
          <StrengthTracker user={userProp} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-[#07070a] py-6 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} Ryvom App • Live Link-in-Bio Portfolio.
      </footer>
    </div>
  );
}

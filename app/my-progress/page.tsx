"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { LoadingState } from "@/components/EmptyState";

export default function MyProgressPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initSelfProfile() {
      try {
        const res = await fetch("/api/self");
        if (!res.ok) {
          throw new Error("Failed to load coach personal profile");
        }
        const json = await res.json();
        if (json.client?.id) {
          router.replace(`/clients/${json.client.id}`);
        } else {
          throw new Error("No client ID returned");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load personal profile");
      }
    }

    initSelfProfile();
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          <main className="flex-1 p-8 flex items-center justify-center">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-md text-center">
              <h3 className="text-sm font-bold text-rose-400 mb-2">Error Loading Profile</h3>
              <p className="text-xs text-zinc-400 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg cursor-pointer"
              >
                Retry
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <main className="flex-1 p-8 flex items-center justify-center">
          <LoadingState />
        </main>
      </div>
    </div>
  );
}

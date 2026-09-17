"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { LoadingState } from "@/components/EmptyState";

export default function ClientProgressRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/clients/${id}`);
    }
  }, [id, router]);

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar />
      <main className="flex-1 p-8 flex items-center justify-center">
        <LoadingState />
      </main>
    </div>
  );
}

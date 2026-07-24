"use client";

import Auth from "@/components/Auth";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0e] text-zinc-100 flex flex-col items-center justify-center p-4 antialiased">
      <div className="w-full max-w-md space-y-4">
        <Auth />
        
        <div className="text-center">
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
